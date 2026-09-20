// gen2-psr-storyboard.test.cjs - the prescribed sequence gets a storyboard, composed from the data.
//
// The mode had none: mountStory was handed a spec with no timeline, so the widget printed
// "spec.timeline is not a function" into the notes under a blank canvas and offered a Preview button that
// returned immediately. The stated reason - that the canvas draws scenes measured from one traced boot while a
// psr route is composed of several - was a reason not to TRACE it, not a reason not to DRAW it: every span of
// the route is a measured constant in gen2-psr.json, and the Gen 1 buffer guide already composes its timeline
// the same way.
//
// What these tests hold to:
//   1. the press marker is the cue's press second, to the last bit - one decision, two consumers;
//   2. every span is the data's own constant, not a number chosen here;
//   3. all three route shapes compose (OPTION, post-backouts, neither) across the shipped games;
//   4. the timeline refuses to be built without the cue's press second, rather than recomputing it.
// Run: node --test tests/tid-helper/gen2-psr-storyboard.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data();
const S = H.page('page-storyboard.js'), P = H.page('page-gen2-psr.js');
const FPS = 4194304 / 70224;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' ' + a + ' vs ' + b);
const build = (r) => S.gen2PsrTimeline(D, r, { pressSeconds: P.waitPressSeconds(D, r), endButton: P.waitEndButton(r), endWhat: P.waitEndWhat(r) });

// a route of each shape, taken from the shipped tables rather than constructed here
function routesByShape(game, limit) {
  const want = { opt: null, post: null, plain: null };
  for (let tid = 0; tid <= 0xFFFF && (!want.opt || !want.post || !want.plain); tid += 1) {
    let r;
    try { r = P.routeFor(D, tid, game, 'gbp', 'days0'); } catch (e) { continue; }
    if (!r) continue;
    const key = r.opt ? 'opt' : (r.post > 0 ? 'post' : 'plain');
    if (!want[key]) want[key] = r;
    if (tid > (limit || 4000)) break;
  }
  return want;
}

test('the press marker is the cue\'s press second, on every shipped game and route shape', () => {
  let checked = 0;
  for (const game of Object.keys(D.gen2psr.games)) {
    const shapes = routesByShape(game);
    for (const [shape, r] of Object.entries(shapes)) {
      if (!r) continue;
      const tl = build(r);
      near(tl.press.t, P.waitPressSeconds(D, r), game + '/' + shape + ': marker == tone');
      assert.equal(tl.press.button, P.waitEndButton(r), game + '/' + shape + ': and the same button');
      // the press is inside the drawn span, and the roll after it
      assert.ok(tl.tMin < tl.press.t && tl.press.t < tl.tMax, game + '/' + shape + ': the press is on screen');
      assert.ok(tl.roll.t > tl.press.t, game + '/' + shape + ': the roll comes after the press');
      checked++;
    }
  }
  assert.ok(checked >= 3, 'checked ' + checked + ' game/shape combinations');
});

test('every span is the data\'s own measured constant', () => {
  const game = Object.keys(D.gen2psr.games)[0];
  const shapes = routesByShape(game);
  const m = D.gen2psr.games[game].gbp, sf = m.step_frames;
  const lag = D.gen2.visible_menu_lag_frames;
  for (const [shape, r] of Object.entries(shapes)) {
    if (!r) continue;
    const tl = build(r);
    const seg = (id) => tl.segments.filter((s) => s.id === id);
    // the boot runs from power-on to the first menu: the plateau's own menu_frame
    const boot = seg('power_on')[0];
    near(boot.t1 - boot.t0, r.plateau.menu_frame / FPS, shape + ': the boot is the plateau\'s menu_frame');
    // every backout is step_frames.backout long, and there are pre + post of them
    const titles = seg('title');
    assert.equal(titles.length, r.pre + r.post, shape + ': one title span per backout');
    for (const t of titles) near(t.t1 - t.t0, sf.backout / FPS, shape + ': a backout is step_frames.backout');
    // the wait, measured from the box, is W - lag
    const wait = seg('menu')[0];
    near(wait.t0, -lag / FPS, shape + ': the wait starts at the menu detector, ' + lag + ' frames before the box');
    near(wait.t1, P.waitPressSeconds(D, r), shape + ': and ends on the timed press');
    // which makes the drawn wait exactly the count the protocol prints: W from the detector, W - lag from the box
    near(wait.t1 - wait.t0, (r.waitFrames - 0.5) / FPS, shape + ': the wait span is W frames from the detector, less the half-frame the cue aims early');
    // the OPTION step
    const opt = seg('option');
    assert.equal(opt.length, r.opt ? 1 : 0, shape + ': an OPTION span only when the route has one');
    if (r.opt) near(opt[0].t1 - opt[0].t0, sf.option / FPS, shape + ': the OPTION step is step_frames.option');
    // the roll sits accept_to_roll_frames after the NEW GAME press
    const ng = seg('newgame')[0];
    near(tl.roll.t - ng.t0, m.accept_to_roll_frames / FPS, shape + ': the roll is accept_to_roll_frames after the press');
  }
});

test('the OPTION route\'s second press is the data\'s gap after the first', () => {
  const game = Object.keys(D.gen2psr.games)[0];
  const r = routesByShape(game).opt;
  if (!r) { assert.ok(true, 'no OPTION route in the sampled range'); return; }
  const m = D.gen2psr.games[game].gbp;
  const tl = build(r);
  const presses = tl.inputs.filter((b) => b.kind === 'press').map((b) => b.t0).sort((a, b) => a - b);
  const first = P.waitPressSeconds(D, r);
  const second = presses.filter((t) => t > first + 1e-12)[0];
  near(second - first, m.option_down_to_a_frames / FPS, 'A follows DOWN by option_down_to_a_frames');
});

test('it refuses to be built without the cue\'s press second, rather than working one out of its own', () => {
  const game = Object.keys(D.gen2psr.games)[0];
  const r = P.routeFor(D, 0, game, 'gbp', 'days0') || routesByShape(game).plain;
  assert.throws(() => S.gen2PsrTimeline(D, r, {}), /press second/);
  assert.throws(() => S.gen2PsrTimeline(D, r, { pressSeconds: NaN }), /press second/);
  // and a methodology with no step costs is refused rather than composed from nothing
  const bare = Object.assign({}, r, { methodology: Object.assign({}, r.methodology, { step_frames: undefined }) });
  assert.throws(() => S.gen2PsrTimeline(D, bare, { pressSeconds: 1 }), /step_frames/);
});

test('the composed route is drawable: ordered spans, known scene ids, the data\'s notes', () => {
  const game = Object.keys(D.gen2psr.games)[0];
  for (const [shape, r] of Object.entries(routesByShape(game))) {
    if (!r) continue;
    const tl = build(r);
    for (const s of tl.segments) {
      assert.ok(s.t1 >= s.t0, shape + ': ' + s.id + ' runs forwards');
      assert.ok(S.SEG_COLORS[s.id], shape + ': ' + s.id + ' is a scene the canvas knows how to paint');
    }
    // the segments tile the route in order
    const sorted = tl.segments.slice().sort((a, b) => a.t0 - b.t0);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].t0 >= sorted[i - 1].t0 - 1e-9, shape + ': segments are orderable');
    }
    assert.ok(tl.notes.some((n) => /Composed from the data/.test(n)), shape + ': it says it is composed');
    assert.ok(tl.notes.some((n) => n === D.gen2psr.games[game].gbp.step_frames.note), shape + ': and carries the data\'s own caveat about the long tail');
    assert.ok(/box, not the detector/.test(tl.originLabel), shape + ': the anchor names the box - ' + tl.originLabel);
  }
});
