// gen2-crystal-cue.test.cjs - the Gen 2 timed-tap mode must never leave a runner on a tab with nothing to pick
// and an instruction to pick something.
//
// WHAT WAS WRONG. Section 4 of this mode opens on "Route targets", which lists the (RTC state, bin) entries of
// the selected platform that produce a member of the target sets in force, each with an aim button; aiming is
// what builds the schedule, and the schedule is what section 7 mounts the cue on. When that list came back
// empty the tab printed one warning line and nothing else, and section 7 went on saying "Pick a target to build
// the cue". On Crystal the list is empty always: the game is RTC-immune, so it has one RTC state and two tables
// of 599 bins, and no bin of either produces a member of either set in force - 0 of 1,198 combinations. A runner
// who opened this mode on Crystal was told to pick a target, found an empty tab, and had no route to a cue at
// all unless they happened to know to switch to the Typed IDs tab. Gold and Silver hit the same empty tab on any
// platform key whose own count is zero (Gold on either DMG protocol), where the warning also did not say that
// another console would have done better.
//
// The prose and the counts are built inside the mode's UI closure, so the module's pure exports cannot see
// them: these drive the mode's own render() through a stand-in document, the way tests/tid-helper/
// callsite.test.cjs and gen2-count-in.test.cjs do, and they walk EVERY (platform, DMG protocol, RTC state) the
// mode offers rather than the default one, because the default was not the only place this happened.
// Run: node --test tests/tid-helper/gen2-crystal-cue.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
// the storyboard and calibration widgets want a real DOM; what is under test is which controls the mode renders
// and what it says around them, so storyWidgetHtml stands in as the mark that a cue reached the page
const mounted = [];
A.widgets = { calibrationHtml: () => '', storyWidgetHtml: () => '<div data-story="g2-story"></div>',
  mountStory: (spec) => { mounted.push(spec); }, bindCalibration: () => {},
  stopAll: () => {}, onStoryClick: () => {}, onCalClick: () => {}, refit: () => {}, reset: () => {}, clearCalMsgs: () => {} };
A.Story = H.page('page-storyboard.js');
const G2P = H.page('page-gen2.js');
const D = H.data(), E = H.engines(), G2 = E.G2, g2 = D.gen2;
const GAMES = ['gold', 'silver', 'crystal'];
const BEEPS = g2.defaults.count_in_beeps, SPACING = g2.defaults.count_in_spacing_s;

function reset() { A.prefs = { version: 1 }; mounted.length = 0; }
function render(game) { const el = { innerHTML: '' }; A.modes.gen2.render(el, game); return el.innerHTML; }
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const aimOf = (h) => { const m = /data-g2-aim="(-?\d+)" data-g2-state="([^"]*)"/.exec(h); return m ? { bin: Number(m[1]), state: m[2] } : null; };
// every (platform id, DMG protocol) the mode offers for a game, with the platform key each resolves to
function scopes(game) {
  const out = [];
  for (const pid of G2P.platformsFor(D, game)) {
    const protos = g2.platforms[pid].family === 'dmg' ? ['dmg', 'dmg-latestart'] : ['dmg'];
    for (const proto of protos) {
      const key = g2.platforms[pid].family === 'dmg' ? (proto === 'dmg-latestart' ? 'dmg-latestart' : 'dmg') : g2.platforms[pid].platform_key;
      if (g2.games[game].platform_keys.indexOf(key) === -1) continue;
      out.push({ pid, proto, key });
    }
  }
  return out;
}
// the mode's own aim -> schedule -> cue path, driven the way a click does: set the pref the aim button carries,
// render again, and see whether a cue reached the page
function cueFromAim(game, pref, aim) {
  reset();
  A.setPref('gen2', Object.assign({}, pref, { aimed: aim.bin, state: aim.state }));
  const html = render(game);
  return { html, cued: /data-story=/.test(html), mounted: mounted.length };
}
// a Trainer ID this table carries whose bin the menu anchor can actually schedule (the earliest bins are due
// before the anchor and scheduleGen2 rejects them, which is a property of the method, not of this fix)
function typableTid(game, key, state, ctx) {
  for (let b = G2.BIN_COUNT - 1; b >= 0; b--) {
    try { G2P.schedule(G2, D, ctx, b, g2.defaults.correction_ms.menu, 'menu', BEEPS, SPACING); } catch (e) { continue; }
    return { bin: b, tid: G2.lookup(g2, game, key, state, b).tid };
  }
  return null;
}

test('every game of the timed-tap mode either offers a route target or names the tab that does, in every RTC state', () => {
  const empties = [];
  for (const game of GAMES) {
    for (const sc of scopes(game)) {
      for (const state of G2.stateIds(g2, game)) {
        const pref = { platform: sc.pid, dmgProtocol: sc.proto, state: state, targetMode: 'set' };
        reset();
        A.setPref('gen2', pref);
        const html = render(game), t = text(html);
        const aim = aimOf(html);
        if (aim) {
          // the tab has something to pick: picking it must reach a cue
          const r = cueFromAim(game, pref, aim);
          assert.ok(r.cued, game + '/' + sc.key + '/' + state + ': aiming bin ' + aim.bin + ' must build the cue');
          assert.equal(r.mounted, 1, game + '/' + sc.key + '/' + state + ': the storyboard is mounted once');
          continue;
        }
        empties.push(game + '/' + sc.key + '/' + state);
        // nothing to pick here. The page must not ask the runner to pick anyway...
        assert.ok(!/Pick a target to build the cue/.test(t),
          game + '/' + sc.key + '/' + state + ': the cue card must not print an instruction this tab cannot carry out');
        // ...it must say so in the cue card, where the runner looking for the cue is looking...
        assert.match(t, /No cue can be built from the Route targets tab/,
          game + '/' + sc.key + '/' + state + ': the cue card says plainly that this tab builds no cue');
        // ...and it must carry a control that reaches the tab that does.
        assert.match(html, /data-g2-mode="tid"[^>]*>Open Typed IDs</,
          game + '/' + sc.key + '/' + state + ': the empty tab offers the way on to Typed IDs');

        // THE PROMISE THE SENTENCE MAKES must hold: a Trainer ID this table carries reaches a cue from the
        // Typed IDs tab. Without this the fix would only be better wording over the same dead end.
        const ctx = G2P.context(D, E.G1, G2, game, sc.pid, sc.proto, state);
        const pick = typableTid(game, sc.key, state, ctx);
        assert.ok(pick, game + '/' + sc.key + '/' + state + ': the table has a schedulable bin');
        reset();
        A.setPref('gen2', Object.assign({}, pref, { targetMode: 'tid', tid: String(pick.tid) }));
        const typed = render(game), typedAim = aimOf(typed);
        assert.ok(typedAim, game + '/' + sc.key + '/' + state + ': typing ' + pick.tid + ' (bin ' + pick.bin + ') offers an aim button');
        const r2 = cueFromAim(game, Object.assign({}, pref, { targetMode: 'tid', tid: String(pick.tid) }), typedAim);
        assert.ok(r2.cued, game + '/' + sc.key + '/' + state + ': the typed-ID route really does reach a cue');
      }
    }
  }
  // the empty tab is not a hypothetical: it is where Crystal always lands, so the walk above must have hit it
  assert.ok(empties.length > 0, 'the empty-tab branch was exercised');
  assert.ok(empties.filter((e) => e.indexOf('crystal/') === 0).length === scopes('crystal').length,
    'every Crystal scope has an empty Route targets tab: ' + empties.filter((e) => e.indexOf('crystal/') === 0).join(', '));
});

test('the counts an empty Route targets tab prints are the engine\'s own, not written down', () => {
  for (const game of GAMES) {
    const sets = G2.targetSetsFor(g2, game, null), states = G2.stateIds(g2, game);
    // recomputed here bin by bin, independently of routeReach, so the two cannot drift together
    const perKey = {};
    let total = 0;
    for (const key of g2.games[game].platform_keys) {
      let n = 0;
      for (const st of states) for (let b = 0; b < G2.BIN_COUNT; b++) {
        const l = G2.lookup(g2, game, key, st, b);
        if (G2.setsAccepting(l.tid, l.lid, l.sid, sets).length) n++;
      }
      perKey[key] = n; total += n;
    }
    const reach = G2P.routeReach(D, G2, game, sets);
    assert.deepEqual(reach.perKey, perKey, game + ': routeReach agrees with a bin-by-bin count');
    assert.equal(reach.total, total, game + ': the game total agrees');
    assert.equal(reach.combosPerKey, states.length * G2.BIN_COUNT, game + ': combinations per platform key');
    assert.equal(reach.combos, g2.games[game].platform_keys.length * states.length * G2.BIN_COUNT, game + ': combinations over the game');

    for (const sc of scopes(game)) {
      if (perKey[sc.key] !== 0) continue;
      reset();
      A.setPref('gen2', { platform: sc.pid, dmgProtocol: sc.proto, state: g2.defaults.state, targetMode: 'set' });
      const t = text(render(game));
      // named by the platform KEY, not the platform. The DMG carries two keys - "START down before the boot
      // logo ends" and "START first pressed during the white gap or the copyright text" - with a table each,
      // so labelling one key's zero with the platform name told the runner both protocols were barren when
      // only the one they were on had been counted.
      assert.ok(t.includes('0 of the ' + reach.combosPerKey.toLocaleString() + ' combinations on ' + g2.platform_keys[sc.key].name),
        game + '/' + sc.key + ': the per-key count ' + reach.combosPerKey + ' is on the page, named by the key');
      assert.ok(t.includes(reach.states + ' RTC state' + (reach.states === 1 ? '' : 's') + ' x ' + reach.bins + ' bins'),
        game + '/' + sc.key + ': the page shows what was counted (' + reach.states + ' x ' + reach.bins + ')');
      if (total === 0) {
        assert.ok(t.includes('0 of the ' + reach.combos.toLocaleString() + ' over all ' + reach.keys.length + ' platform keys'),
          game + '/' + sc.key + ': with nothing reachable anywhere, the page gives the whole-game count ' + reach.combos);
      } else {
        // some other platform key does have one: the page must name it rather than leave the runner guessing
        for (const k of reach.keys) {
          if (k === sc.key || !perKey[k]) continue;
          assert.ok(t.includes(g2.platform_keys[k].name + ' (' + perKey[k] + ')'),
            game + '/' + sc.key + ': ' + k + ' has ' + perKey[k] + ' and must be named as somewhere that does');
        }
      }
    }
  }
});

test('Crystal: no route target is reachable at all, and the page says so where the runner is looking', () => {
  const sets = G2.targetSetsFor(g2, 'crystal', null);
  assert.deepEqual(sets.map((s) => s.key), (g2.games.crystal.default_target_sets || []).slice(),
    'the sets in force on Crystal are the ones the data puts in force');
  assert.deepEqual(G2.stateIds(g2, 'crystal'), ['days0'], 'Crystal is RTC-immune, so there is one state to check');
  const reach = G2P.routeReach(D, G2, 'crystal', sets);
  assert.equal(reach.total, 0, 'no (platform key, RTC state, bin) of Crystal produces a member of either set');
  assert.equal(reach.combos, 1198, 'and that is every combination there is: ' + reach.combos);

  reset();
  A.setPref('gen2', { targetMode: 'set' });
  const html = render('crystal'), t = text(html);
  assert.ok(!/data-g2-aim=/.test(html), 'there is no aim button to offer, and none is invented');
  // the sets are still named, with their own notes, so the runner can see WHICH targets are out of reach
  for (const s of sets) {
    assert.ok(t.includes(s.key), 'the set ' + s.key + ' is still named on the tab');
    if (s.note) assert.ok(t.includes(s.note.slice(0, 40)), 'the data\'s own note for ' + s.key + ' is still printed');
  }
  assert.match(t, /Nor does any other console: 0 of the 1,198 over all 2 platform keys/,
    'the tab gives the measured count over the whole game');
  assert.match(t, /No cue can be built from the Route targets tab: no route target is reachable on Pokemon Crystal \(English\) under this methodology, on any of the 2 platform keys it runs on\./,
    'and the cue card says it in one sentence rather than asking for a target');
  // what the runner CAN do is quoted from the data, not asserted: the scoped table's own reach
  const cov = G2P.coverage(D, G2, 'crystal', 'gbp', 'days0');
  assert.ok(t.includes('it holds ' + cov.tids.toLocaleString() + ' of the ' + cov.space.toLocaleString()),
    'the Typed IDs route is quoted with the table\'s real reach (' + cov.tids + ' of ' + cov.space + ')');
  assert.ok(t.includes(D.gen2psr.games.crystal.gbp.coverage.percent + '% of all ' + cov.space.toLocaleString() + ' Trainer IDs'),
    'and the multi-step mode that does reach an arbitrary ID is quoted at the data\'s own percentage');

  // the button the sentence points at has to be wired, not decoration: onEvent is what the app calls on a
  // click, so drive it with a stand-in target the way page-render.js delivers one
  const ev = { type: 'click', target: { closest: (sel) => (sel === '[data-g2-mode]' ? { getAttribute: () => 'tid' } : null) } };
  assert.equal(A.modes.gen2.onEvent(ev, 'crystal'), 'render', 'pressing Open Typed IDs asks for a re-render');
  assert.equal(A.pref('gen2', 'targetMode', 'set'), 'tid', 'and it is the Typed IDs tab that comes up');
  const typedHtml = render('crystal');
  assert.match(typedHtml, /id="g2-tid"/, 'which is a tab with a control on it');
});

test('POSITIVE CONTROL: where route targets exist the tab and the cue card are unchanged', () => {
  reset();
  A.setPref('gen2', { platform: 'gse', state: 'halt-days200', targetMode: 'set' });
  const html = render('gold'), t = text(html);
  const aim = aimOf(html);
  assert.ok(aim, 'gold on the GBP silicon still lists a route target with an aim button');
  assert.ok(!/No cue can be built/.test(t), 'and says nothing about an empty tab');
  assert.match(t, /Pick a target to build the cue\./, 'the cue card still asks for a target, which here can be given');
  const r = cueFromAim('gold', { platform: 'gse', targetMode: 'set' }, aim);
  assert.ok(r.cued, 'and aiming it builds the cue');
});
