// rs-default-cue.test.cjs - the Ruby / Sapphire mode offers a route to a cue from the state it opens in.
//
// WHAT WAS WRONG. targetMode defaults to 'tid' and the Trainer ID box starts empty, and tidResultHtml returned ''
// for an empty box. Both games therefore opened as two tabs, one empty text field and zero data-rs-aim buttons,
// while section 7 printed "Pick a target frame to build the cue" - an instruction with nothing on the open tab to
// act on. The frames existed the whole time: the other tab, "Next 60 s", renders 3585 of them (P_min to
// P_min + 3584 at 59.7275 fps) with an aim button each. A runner who did not think to change tabs had no route to
// a cue on either game, which is how an audit of all 24 mode/game combinations found these two.
//
// The call sites are inside the UI closure, so the pure functions alone cannot see the defect: these drive the
// mode's own render() and onEvent() through a stand-in document, the way page-render.js drives them in the app.
// Run: node --test tests/tid-helper/rs-default-cue.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
A.Story = H.page('page-storyboard.js');
A.Cue = H.page('page-cue.js');       // the browser binds both; the mounted program below is built through them

let story = null;
A.widgets = { calibrationHtml: () => '', bindCalibration: () => {}, stopAll: () => {}, onStoryClick: () => {}, onCalClick: () => {},
  refit: () => {}, reset: () => {}, clearCalMsgs: () => {},
  storyWidgetHtml: (id) => '<div data-story="' + id + '"></div>',
  mountStory: (spec) => { story = spec; } };
const RS = H.page('page-gen3-rs.js');
const D = H.data(), E = H.engines();
const mode = A.modes['gen3-rs'];
const FPS = E.core.GBA_FPS;
const GAMES = ['ruby', 'sapphire'];

function reset() { A.prefs = { version: 1 }; story = null; }
// the page as a runner first sees it: no stored preferences at all
function renderFresh(game, prefs) {
  reset();
  if (prefs) A.setPref('rs', prefs);
  const el = { innerHTML: '' };
  mode.render(el, game);
  return el.innerHTML;
}
function rerender(game) { const el = { innerHTML: '' }; mode.render(el, game); return el.innerHTML; }
// a click the way the app delivers it: only the selector that matches the button resolves
function clickAim(game, P) {
  const node = { getAttribute: (k) => (k === 'data-rs-aim' ? String(P) : null) };
  return mode.onEvent({ type: 'click', target: { closest: (sel) => (sel === '[data-rs-aim]' ? node : null) } }, game);
}
const aims = (html) => [...html.matchAll(/data-rs-aim="(-?\d+)"/g)].map((m) => Number(m[1]));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the page a runner lands on carries at least one frame they can aim at', () => {
  for (const game of GAMES) {
    const html = renderFresh(game);
    const offered = aims(html);
    // REGRESSION: this was 0 on both games, with the tab bar, the empty box and nothing else
    assert.ok(offered.length > 0, game + ': the default view offers no frame to aim at, so there is no route to a cue');
    assert.equal(story, null, game + ': and nothing is aimed on the runner\'s behalf before they choose');
    // what is offered starts where the chosen opening path starts, and stays inside the horizon
    const pMin = RS.model(D, game).model.p_min_frames;
    assert.equal(offered[0], pMin, game + ': the first frame offered is P_min');
    assert.ok(offered.every((P) => P >= pMin), game + ': no frame before P_min is offered');
  }
});

test('pressing aim on that first row builds the cue, at the press second the model gives', () => {
  for (const game of GAMES) {
    const html = renderFresh(game);
    const P = aims(html)[0];
    assert.equal(clickAim(game, P), 'render', game + ': the aim button is wired to a re-render');
    const after = rerender(game);
    assert.match(after, /data-story="rs-story"/, game + ': the storyboard widget is on the page after aiming');
    assert.ok(story && typeof story.program === 'function', game + ': a cue program was mounted');
    const prog = story.program();
    const a = prog.cues.filter((c) => c.kind === 'A');
    assert.equal(a.length, 1, game + ': exactly one A tone');
    // the tone sits at the press second for P, measured from the frame the copyright text is fully drawn, with
    // no correction applied: gen3-rs.json's defaults.correction_ms is null and a fresh page has no samples
    assert.equal(D.gen3rs.defaults.correction_ms, null, 'the data still carries no measured default correction');
    assert.ok(Math.abs(a[0].t - RS.pressSeconds(D, game, P)) < 1e-9,
      game + ': the A tone is at the press second (' + a[0].t + ' vs ' + RS.pressSeconds(D, game, P) + ')');
    assert.ok(prog.cues.some((c) => c.t < a[0].t), game + ': the count-in leads into it');
  }
});

test('every number in the earliest-press rows is the data\'s, and the recorded ones are marked as recorded', () => {
  for (const game of GAMES) {
    const g = D.gen3rs.games[game], pMin = g.model.p_min_frames, seed = g.dead_battery_seed;
    // the window is the data's own block, not a length chosen in the page
    const check = g.dead_battery_checks.find((c) => c.p_min === pMin && c.read_back === seed);
    assert.ok(check, game + ': the data records a dead-battery check at the default P_min and seed');
    const hr = RS.headRows(D, game, seed, pMin, pMin + 100000);
    assert.equal(hr.rows.length, check.pairs_P_min_to_plus5.length, game + ': the window is the length of the data\'s own pairs block');
    assert.equal(hr.check.run, check.run, game);
    // the page's model reproduces each recorded triple, and each row says so
    check.pairs_P_min_to_plus5.forEach((t, i) => {
      assert.equal(hr.rows[i].P, t[0], game + ': frame');
      assert.equal(hr.rows[i].tid, t[1], game + ': ' + t[0] + ' TID');
      assert.equal(hr.rows[i].sid, t[2], game + ': ' + t[0] + ' SID');
      assert.ok(hr.rows[i].attested, game + ': P ' + t[0] + ' is recorded in the data and must be marked');
    });
    // and those numbers reach the rendered page, TID and SID both
    const html = renderFresh(game);
    const body = text(html);
    assert.equal((html.match(/<span class="tag ok">recorded<\/span>/g) || []).length, check.pairs_P_min_to_plus5.length + 1,
      game + ': one mark per recorded row, plus the one in the legend that explains it');
    for (const t of check.pairs_P_min_to_plus5) {
      assert.ok(body.includes(A.fmtTid(t[1])), game + ': the recorded TID for P ' + t[0] + ' is printed');
      assert.ok(body.includes(A.fmtTid(t[2])), game + ': the recorded SID for P ' + t[0] + ' is printed');
    }
    assert.ok(body.includes(check.run), game + ': the page names the run the pairs came from');
    assert.ok(body.includes('P_min = ' + pMin), game + ': the page says which frame the rows start at');
    assert.ok(body.includes(A.fmtS(RS.pressSeconds(D, game, pMin), 2) + ' after the copyright text is fully drawn'),
      game + ': and how long after the anchor that is');
  }
});

test('a seed the data records no check for is not dressed up as one', () => {
  // NEGATIVE CONTROL for the mark above: with a live battery the seed is the fold of the clock, which no
  // dead-battery run read back, so the same rows must carry no mark and the page must say they carry none
  for (const game of GAMES) {
    const html = renderFresh(game, { battery: 'live', bootDate: '2026-09-19', bootTime: '12:00' });
    const seed = RS.rsSeed(2026, 9, 19, 12, 0).seed;
    assert.notEqual(seed, D.gen3rs.games[game].dead_battery_seed, game + ': the live-battery seed differs from the dead one');
    assert.ok(aims(html).length > 0, game + ': a live battery with a typed clock still offers frames to aim at');
    assert.ok(!/<span class="tag ok">recorded<\/span>/.test(html), game + ': nothing may be marked recorded at a seed no run read back');
    assert.ok(text(html).includes('records no dead-battery check at seed ' + seed),
      game + ': the page states that these rows are the model\'s output and not recorded pairs');
  }
});

test('while there is no cue, the page names the control to use rather than the task', () => {
  for (const game of GAMES) {
    const html = renderFresh(game);
    const body = text(html);
    // REGRESSION: "Pick a target frame to build the cue" was true, and unfollowable on the tab it was printed on
    assert.ok(!body.includes('Pick a target frame to build the cue'),
      game + ': the old sentence named the task and not the control');
    assert.ok(body.includes('No cue yet: no frame is aimed'), game + ': section 7 says why there is no cue');
    assert.ok(body.includes('4. Target'), game + ': it names the section that has the control');
    // every control the prompt names is actually on the page, spelled the way the prompt spells it
    for (const label of ['Trainer ID wanted', 'Next 60 s']) {
      assert.ok(body.includes(label), game + ': the page names "' + label + '" and must therefore carry it');
      assert.ok(body.indexOf(label) !== body.lastIndexOf(label), game + ': "' + label + '" is both named and present as a control');
    }
  }
});

test('with a live battery and no clock typed, the prompt points at the boxes that decide the seed', () => {
  for (const game of GAMES) {
    const html = renderFresh(game, { battery: 'live' });
    const body = text(html);
    assert.equal(aims(html).length, 0, game + ': without a seed there is no pair to aim at, so no frame is offered');
    assert.ok(body.includes('the seed is not known until the boot clock is typed'), game + ': section 7 says what is missing');
    for (const label of ['Boot date', 'Boot time']) assert.ok(body.includes(label), game + ': it names the ' + label + ' box, which is on the page');
    assert.ok(!body.includes('Pick a target frame to build the cue'), game + ': and does not ask for a target that cannot exist yet');
  }
});

test('typing a Trainer ID replaces the earliest presses with the frames that give it', () => {
  for (const game of GAMES) {
    const g = D.gen3rs.games[game], pMin = g.model.p_min_frames, seed = g.dead_battery_seed;
    const wanted = g.dead_battery_checks.find((c) => c.p_min === pMin && c.read_back === seed).pairs_P_min_to_plus5[3][1];
    const html = renderFresh(game, { tid: String(wanted) });
    const body = text(html);
    assert.ok(!body.includes('Nothing typed yet'), game + ': the empty-box block is for the empty box only');
    assert.ok(body.includes(A.fmtTid(wanted) + ' occurs at'), game + ': the typed Trainer ID is searched for');
    const hits = RS.searchTid(D, game, seed, wanted, pMin, pMin + Math.round(60 * FPS), 20);
    assert.ok(hits.length > 0, game + ': it occurs inside the default horizon');
    assert.deepEqual(aims(html), hits.map((r) => r.P), game + ': the aimable frames are the frames that give it');
  }
});
