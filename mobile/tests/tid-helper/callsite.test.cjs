// callsite.test.cjs - the fixes are tested where the page USES them, not only where they are defined.
//
// WHY THIS FILE EXISTS. Three defects were fixed by adding a helper and calling it: a scoped coverage count in
// the Gen 2 timed mode, a P_min option filter and a target-set filter in the Ruby/Sapphire mode. Each came with
// a test - and every one of those tests exercised the new helper directly, through the module's `pure` exports.
// The call sites live inside the UI closure, so reverting them (back to `Object.keys(notes)`, back to
// `A.D.gen1.target_sets`, back to the union figure) left the whole suite green: the helpers were still correct
// and still unused. A regression test that cannot see the line that was wrong is decoration. These drive the
// modes' own render() through a stand-in document, the way page-render.js drives them in the app.
// Run: node --test tests/tid-helper/callsite.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
// page-widgets.js installs A.widgets against a real DOM; these modes only need it to return markup, and what
// this file is checking is the text around the numbers, not the storyboard or the calibration block.
A.widgets = { calibrationHtml: () => '', storyWidgetHtml: () => '', mountStory: () => {}, bindCalibration: () => {},
  stopAll: () => {}, onStoryClick: () => {}, onCalClick: () => {}, refit: () => {}, reset: () => {}, clearCalMsgs: () => {} };
const RS = H.page('page-gen3-rs.js');
const G2P = H.page('page-gen2.js');
const D = H.data(), E = H.engines();

function render(modeId, game) { const el = { innerHTML: '' }; A.modes[modeId].render(el, game); return el.innerHTML; }
function reset() { A.prefs = { version: 1 }; }

test('R/S: the P_min selector on the rendered page offers only frames the data attests a press on', () => {
  for (const game of ['ruby', 'sapphire']) {
    reset();
    const html = render('gen3-rs', game);
    const attested = RS.attestedPressFrames(D, game);
    const notes = RS.model(D, game).model.p_min_frames_notes;
    const offered = Object.keys(notes).filter((k) => html.includes('P_min ' + notes[k]) && html.includes(k + ' -&gt; P_min ' + notes[k]) === false ? true : html.includes(k));
    // the selector renders "<key> -> P_min <frames>" per option; check each key of the data against the page
    for (const k of Object.keys(notes)) {
      const inSelector = new RegExp('data-id="' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"|<option[^>]*value="' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(html);
      if (attested[notes[k]]) assert.ok(inSelector, game + ': ' + k + ' is a press frame the data attests and must be offered');
      else assert.ok(!inSelector, game + ': ' + k + ' = ' + notes[k] + ' is not a press frame in the data and must not be a P_min option');
    }
    // the specific one this was about: 288 is the DIFFERENCE between two attested press frames, not a press
    const delta = Object.keys(notes).filter((k) => notes[k] === 288);
    assert.equal(delta.length, 1, game + ': the data still carries the box-cost note this was about');
    assert.ok(!attested[288], game + ': 288 is not attested as a press frame');
    assert.ok(html.includes('288'), game + ': it is still shown, so the number is not hidden from the runner');
  }
});

test('R/S: the rendered page offers no Gen 1 target set, and says why there is no tab', () => {
  for (const game of ['ruby', 'sapphire']) {
    reset();
    const html = render('gen3-rs', game);
    for (const [k, spec] of Object.entries(D.gen1.target_sets)) {
      if ((spec.games || []).includes(game)) continue;
      assert.ok(!html.includes('data-id="' + k + '"'), game + ': ' + k + ' lists ' + JSON.stringify(spec.games) + ' and must not be offered here');
      assert.ok(!html.includes('>' + spec.name + '<'), game + ': ' + spec.name + ' must not be offered here');
    }
    assert.ok(/No target set in the data lists/.test(html), game + ': the page says why the tab is absent rather than showing an empty one');
  }
  // POSITIVE CONTROL: the same filter over a Gen 1 game still returns that game's sets, so this is a filter and
  // not a blanket removal
  const red = RS.targetSetsFor(D, 'red');
  assert.ok(red.length >= 3, 'red still has its own sets: ' + red.map((s) => s.key).join(', '));
  for (const s of red) assert.ok(s.spec.games.includes('red'));
});

test('Gen 2: the "not in this table" branch renders, and quotes the scoped figure too', () => {
  // this branch had no test at all, and a careless edit put a variable from the sibling function into it - a
  // ReferenceError that only fires when someone types a Trainer ID the table does not carry, which is the
  // common case the sentence exists for
  reset();
  A.setPref('gen2', { targetMode: 'tid', tid: '$0001' });
  let html;
  assert.doesNotThrow(() => { html = render('gen2', 'gold'); }, 'a Trainer ID with no candidates must render');
  assert.match(html, /Most likely nothing you did/, 'the explanation is printed');
  const g2 = D.gen2, ctx = G2P.context(D, E.G1, E.G2, 'gold', g2.defaults.platform, 'dmg', g2.defaults.state);
  const scoped = G2P.coverage(D, E.G2, 'gold', ctx.platformKey, ctx.state);
  assert.ok(html.includes(scoped.entries + ' bins carrying ' + scoped.tids.toLocaleString('en-US')),
    'and it is the scoped count, not the union: expected ' + scoped.entries + ' bins carrying ' + scoped.tids);
  assert.ok(html.includes((E.G2.ID_MAX + 1).toLocaleString('en-US')), 'the ID space comes from the engine');
});

test('Gen 2: the coverage figure on the rendered page is the one table in scope, not the union over all of them', () => {
  for (const game of ['gold', 'silver', 'crystal']) {
    reset();
    // the coverage sentence lives on the typed-Trainer-ID tab; the mode opens on target sets
    A.setPref('gen2', { targetMode: 'tid' });
    const html = render('gen2', game);
    // the scope the mode itself defaulted to, built the way ctxFor builds it, so the test cannot drift from it
    const g2 = D.gen2, pid = g2.defaults.platform;
    const ctxScope = G2P.context(D, E.G1, E.G2, game, pid, 'dmg', g2.defaults.state);
    const scoped = G2P.coverage(D, E.G2, game, ctxScope.platformKey, ctxScope.state);
    const union = D.gen2.inversion.games[game].ambiguity.all_distinct_tables;
    assert.ok(scoped.tids <= D.gen2.bin_count || scoped.tids <= 600, game + ': one table reaches about six hundred Trainer IDs, not tens of thousands (' + scoped.tids + ')');
    assert.ok(html.includes(scoped.tids.toLocaleString('en-US')) || html.includes(String(scoped.tids)), game + ': the scoped count ' + scoped.tids + ' is on the page');
    // the union may appear, but only where it is called a union
    const unionForms = [union.distinct_tids.toLocaleString('en-US'), String(union.distinct_tids)];
    const shown = unionForms.filter((f) => html.includes(f))[0];
    if (shown) {
      const idx = html.indexOf(shown);
      const around = html.slice(Math.max(0, idx - 260), idx + 260);
      assert.ok(/every platform|every RTC state|all .* tables|union/i.test(around),
        game + ': the union figure ' + union.distinct_tids + ' appears without being labelled a union: ' + around.slice(0, 200));
    }
    assert.ok(union.distinct_tids > scoped.tids * 1.5 || game === 'crystal',
      game + ': the two figures really are different (' + union.distinct_tids + ' vs ' + scoped.tids + ')');
  }
});
