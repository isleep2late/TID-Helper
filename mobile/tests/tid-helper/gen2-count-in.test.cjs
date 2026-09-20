// gen2-count-in.test.cjs - the Gen 2 timed-tap protocol must promise the count-in the cue engine will actually
// play, not the number typed in the "Count-in beeps" box.
//
// WHAT WAS WRONG. scheduleGen2 builds the count-in through gen1tid's countInCues, which drops a beep whenever
// it would fall before the count-in floor: the anchor itself on the menu anchor, menu + COUNT_IN_CLEAR_S on
// the power-on and reset anchors. The schedule reports the loss as droppedCountIn. The protocol line printed
// ctx.beeps - the request - and then appended a parenthetical about the drops, so the sentence and its own
// footnote disagreed. Over every schedule this page can build at its defaults (4 beeps, 1.0 s spacing, the
// data's corrections) that is 1,479 of 13,734 schedules understated by at least one beep and 449 that promise
// four beeps over a program containing the A tone alone.
//
// The sentence is built inside the mode's UI closure, so the pure exports cannot see it: these drive the
// mode's own render() through a stand-in document, the way tests/tid-helper/callsite.test.cjs does.
// Run: node --test tests/tid-helper/gen2-count-in.test.cjs tests/tid-helper/cue.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
// the storyboard and calibration widgets want a real DOM; what is under test is the protocol prose
A.widgets = { calibrationHtml: () => '', storyWidgetHtml: () => '', mountStory: () => {}, bindCalibration: () => {},
  stopAll: () => {}, onStoryClick: () => {}, onCalClick: () => {}, refit: () => {}, reset: () => {}, clearCalMsgs: () => {} };
const G2P = H.page('page-gen2.js');
const D = H.data(), E = H.engines();
const g2 = D.gen2, BEEPS = g2.defaults.count_in_beeps, SPACING = g2.defaults.count_in_spacing_s;

function reset() { A.prefs = { version: 1 }; }
function render(game) { const el = { innerHTML: '' }; A.modes.gen2.render(el, game); return el.innerHTML; }
function ctxOf(game, platformId, proto) { return G2P.context(D, E.G1, E.G2, game, platformId, proto || 'dmg', g2.defaults.state); }
function correctionFor(anchor) { return g2.defaults.correction_ms[anchor] == null ? 100 : g2.defaults.correction_ms[anchor]; }
// the page's own schedule call, so the test reads the same droppedCountIn the sentence is built from
function schedOf(ctx, anchor, bin) {
  try { return G2P.schedule(E.G2, D, ctx, bin, correctionFor(anchor), anchor, BEEPS, SPACING); } catch (e) { return null; }
}
// the first bin of this (platform, anchor) whose schedule drops exactly `want` beeps, or any drop when want is null
function binDropping(ctx, anchor, want) {
  for (let b = 0; b < E.G2.BIN_COUNT; b++) {
    const s = schedOf(ctx, anchor, b);
    if (!s) continue;
    if (want === null ? s.droppedCountIn > 0 && s.droppedCountIn < BEEPS : s.droppedCountIn === want) return { bin: b, sched: s };
  }
  return null;
}
function showBin(game, platformId, anchor, bin) {
  reset();
  A.setPref('gen2', { platform: platformId, dmgProtocol: 'dmg', anchor: anchor, state: g2.defaults.state, aimed: bin, beeps: BEEPS });
  return render(game);
}
const countCues = (s) => s.cues.filter((c) => c.kind === 'count').length;

test('the count-in the engine plays is what the protocol promises, beep for beep', () => {
  const ctx = ctxOf('gold', 'gbp');
  assert.ok(ctx.anchors.indexOf('menu') !== -1, 'the menu anchor is offered on the Game Boy Player');

  // (a) a schedule that drops SOME of the count-in
  const some = binDropping(ctx, 'menu', null);
  assert.ok(some, 'gold/gbp has a bin whose count-in is clipped but not erased');
  const played = BEEPS - some.sched.droppedCountIn;
  assert.equal(countCues(some.sched), played, 'the engine really plays that many count tones');
  const h = showBin('gold', 'gbp', 'menu', some.bin);
  assert.ok(h.includes('Cue: ' + played + ' count-in beep' + (played === 1 ? '' : 's') + ' then the long high beep'),
    'the sentence names the ' + played + ' beeps that sound (bin ' + some.bin + ')');
  assert.ok(!h.includes('Cue: ' + BEEPS + ' count-in beep' + (BEEPS === 1 ? '' : 's') + ' then'),
    'and not the ' + BEEPS + ' that were asked for - this is the defect');
  assert.ok(h.includes(some.sched.droppedCountIn + ' count-in beep' + (some.sched.droppedCountIn === 1 ? '' : 's') + ' left out'),
    'the missing beeps are still accounted for');
  assert.ok(h.includes('before your tap on the box'), 'and the menu anchor says what the count-in ran into');

  // (b) a schedule that drops ALL of it: one tone, no run-up
  const all = binDropping(ctx, 'menu', BEEPS);
  assert.ok(all, 'gold/gbp has a bin close enough to the anchor to lose the whole count-in');
  assert.equal(countCues(all.sched), 0, 'the program really is the A tone alone');
  assert.equal(all.sched.cues.length, 1, 'nothing else is scheduled either');
  const ha = showBin('gold', 'gbp', 'menu', all.bin);
  assert.ok(ha.includes('the long high beep alone, at ' + A.fmtS(all.sched.tA) + ' after the anchor'),
    'the cue is described as the single tone it is (bin ' + all.bin + ')');
  assert.ok(!/count-in beeps? then the long high beep/.test(ha), 'no count-in is promised at all');
  assert.ok(ha.includes('No count-in at all: all ' + BEEPS + ' beeps were left out'), 'and the loss is stated, not left to arithmetic');
  assert.ok(ha.includes('nothing to count into'), 'the consequence for a frame-exact tap is spelled out');
  assert.ok(!/\b0 count-in beeps?\b/.test(ha), 'it does not report the count-in as a count of zero');

  // (c) an unclipped schedule still prints the full request, with no footnote
  const full = binDropping(ctx, 'menu', 0);
  assert.ok(full, 'most bins are far enough from the anchor for the whole count-in');
  const hf = showBin('gold', 'gbp', 'menu', full.bin);
  assert.ok(hf.includes('Cue: ' + BEEPS + ' count-in beeps then the long high beep'), 'the full count-in is named (bin ' + full.bin + ')');
  assert.ok(!hf.includes('left out'), 'and nothing is said about drops that did not happen');
  assert.ok(!hf.includes('No count-in at all'), 'nor the no-count-in warning');
});

test('the power-on anchor prints its own played count and names the menu as the floor', () => {
  const ctx = ctxOf('gold', 'gbc');
  assert.ok(ctx.anchors.indexOf('poweron') !== -1, 'the Game Boy Color offers the power-on anchor');
  const some = binDropping(ctx, 'poweron', null);
  assert.ok(some, 'the power-on anchor clips the count-in too: its floor is the menu plus the clearance');
  const played = BEEPS - some.sched.droppedCountIn;
  assert.equal(countCues(some.sched), played);
  const h = showBin('gold', 'gbc', 'poweron', some.bin);
  assert.ok(h.includes('Cue: ' + played + ' count-in beep' + (played === 1 ? '' : 's') + ' then the long high beep'), 'the played count is printed');
  assert.ok(!h.includes('Cue: ' + BEEPS + ' count-in beeps then'), 'not the requested count');
  assert.ok(h.includes('before the menu'), 'this anchor drops beeps against the menu, not against the runner\'s tap');
  assert.ok(!h.includes('before your tap on the box'), 'and does not borrow the menu anchor\'s reason');

  const all = binDropping(ctx, 'poweron', BEEPS);
  assert.ok(all, 'and it has bins that lose the whole count-in');
  const ha = showBin('gold', 'gbc', 'poweron', all.bin);
  assert.ok(ha.includes('No count-in at all: all ' + BEEPS + ' beeps were left out'), 'with the same warning');
  assert.ok(ha.includes('before the menu'), 'and the same reason');
  assert.equal(countCues(all.sched), 0);
});

test('a count-in of zero is described as no count-in, not as beeps left out', () => {
  // the beeps box accepts 0, which is a request for no count-in rather than a clipped one: the warning about a
  // frame-exact tap with no run-up must not fire, because nothing was taken away
  const ctx = ctxOf('gold', 'gbp');
  const full = binDropping(ctx, 'menu', 0);
  reset();
  A.setPref('gen2', { platform: 'gbp', dmgProtocol: 'dmg', anchor: 'menu', state: g2.defaults.state, aimed: full.bin, beeps: 0 });
  const h = render('gold');
  assert.ok(h.includes('the long high beep alone, at '), 'the cue is the single tone');
  assert.ok(!h.includes('left out'), 'nothing was dropped');
  assert.ok(!h.includes('No count-in at all'), 'so nothing is reported as lost');
});

test('over every schedule this page can build, the promise and the program agree', () => {
  // the schedule-level invariant behind the sentence, swept rather than sampled: one family per distinct
  // (methodology, anchor, reset delay), which is all scheduleGen2 reads. This is the measurement the fix quotes.
  const fam = new Map();
  for (const game of Object.keys(g2.games)) {
    for (const pid of G2P.platformsFor(D, game)) {
      const protos = g2.platforms[pid].family === 'dmg' ? ['dmg', 'dmg-latestart'] : ['dmg'];
      for (const proto of protos) {
        let ctx;
        try { ctx = ctxOf(game, pid, proto); } catch (e) { continue; }
        for (const anchor of ctx.anchors) {
          const k = ctx.methId + '|' + anchor + '|' + (anchor === 'reset' ? ctx.resetExtraS : '');
          if (!fam.has(k)) fam.set(k, { ctx, anchor });
        }
      }
    }
  }
  let total = 0, someDrop = 0, allDrop = 0;
  for (const { ctx, anchor } of fam.values()) {
    for (let b = 0; b < E.G2.BIN_COUNT; b++) {
      const s = schedOf(ctx, anchor, b);
      if (!s) continue;
      total++;
      assert.equal(countCues(s), BEEPS - s.droppedCountIn, ctx.methId + ' ' + anchor + ' bin ' + b + ': droppedCountIn must account for every missing tone');
      assert.equal(s.countInTimes.length, BEEPS - s.droppedCountIn, ctx.methId + ' ' + anchor + ' bin ' + b + ': countInTimes must match');
      if (s.droppedCountIn > 0) someDrop++;
      if (s.droppedCountIn >= BEEPS) allDrop++;
    }
  }
  assert.ok(total > 10000, 'the sweep really covered the page (' + total + ' schedules over ' + fam.size + ' families)');
  assert.ok(someDrop > 0 && allDrop > 0, 'clipped and erased count-ins both occur (' + someDrop + ' / ' + allDrop + ' of ' + total + ')');
});
