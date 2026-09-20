// gen1-visible-menu.test.cjs - the Gen 1 timed method anchors on the NEW GAME box, not the menu detector.
//
// THE DEFECT THIS PINS. A Gen 1 Trainer ID table's offsets are counted from menu_open, the derivation harness's
// menu detector (wSaveFileStatus == 1). Nothing is on screen at that frame. What a runner sees is the NEW GAME
// box being drawn, menu_visible, which scene-timelines measures 46 to 53 frames (0.77 to 0.89 s) later on Red,
// Blue and Yellow. The protocol has always told the runner to start the cue the instant the menu appears, while
// the cue and the storyboard both counted from the detector - so every press was aimed about three quarters of a
// second late, and on the power-on anchor the amber MENU blip sounded that far before anything appeared, under a
// sentence saying a menu far from the blip meant the attempt was dead. Gen 2 carries the same distinction in its
// own data (visible_menu_frame, visible_menu_lag_frames) and has always used it; Gen 1 was written first.
// Run: node --test tests/tid-helper/gen1-visible-menu.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines();
const fps = 4194304 / 70224;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' ' + a + ' vs ' + b);

test('every Gen 1 methodology: the timing block and the traces agree on the detector frame, and the box is later', () => {
  const T = H.page('page-gen1-timed.js');
  for (const id of Object.keys(D.gen1.methodologies)) {
    const timing = D.gen1.methodologies[id].timing, ev = D.scenes.methodologies[id].events;
    assert.equal(timing.menu_frame, ev.menu_open, id + ': gen1-tid.json and scene-timelines.json must mean the same frame by the detector, or a lag computed from one and applied to the other is nonsense');
    assert.ok(ev.menu_visible > ev.menu_open, id + ': the box is drawn after the detector fires');
    const vm = T.visibleMenu(D, id, timing);
    assert.equal(vm.error, undefined, id + ': the lag resolves');
    assert.equal(vm.lagFrames, ev.menu_visible - ev.menu_open, id);
    near(vm.lagS, (ev.menu_visible - ev.menu_open) / fps, id);
    assert.ok(vm.lagS > 0.7 && vm.lagS < 0.95, id + ': Gen 1 lags are three quarters of a second, not a rounding error (' + vm.lagS + ' s)');
  }
});

test('a disagreement between the two data files is refused, not papered over', () => {
  const T = H.page('page-gen1-timed.js');
  const id = 'red/gba/hold-start-v1';
  const bent = T.visibleMenu(D, id, { menu_frame: D.gen1.methodologies[id].timing.menu_frame + 1 });
  assert.ok(bent.error && /menu detector/.test(bent.error), 'a mismatch returns an error rather than a lag: ' + JSON.stringify(bent));
  assert.equal(T.visibleMenu(D, 'red/gba/nope', { menu_frame: 1 }).error !== undefined, true, 'an unknown methodology has no lag');
});

test('context() carries the lag, so a schedule built from it aims at the box', () => {
  const T = H.page('page-gen1-timed.js'), G1 = E.G1;
  for (const [game, pk] of [['red', 'gbp'], ['yellow', 'gbp'], ['blue', 'dmg']]) {
    const ctx = T.context(D, G1, game, pk), ev = D.scenes.methodologies[ctx.methId].events;
    near(ctx.visibleLagS, (ev.menu_visible - ev.menu_open) / fps, ctx.methId + ': context() resolved the lag');
    assert.equal(ctx.visibleFrame, ev.menu_visible, ctx.methId);
    const withLag = T.schedule(G1, ctx, 'menu', 500, 0, 4, 1.0);
    const detector = G1.schedule('menu', 500, 0, { family: ctx.timing, beeps: 4, spacingS: 1.0, methodology: ctx.meth });
    near(detector.tA - withLag.tA, ctx.visibleLagS, ctx.methId + ': the box-anchored aim is exactly the lag earlier');
    near(withLag.tA, G1.targetSeconds(500) - ctx.visibleLagS, ctx.methId);
    assert.equal(withLag.visibleLagS, ctx.visibleLagS, ctx.methId + ': the schedule records what it was built with');
  }
});

test('the power-on MENU blip marks the box; the A aim, counted from the detector, does not move', () => {
  const T = H.page('page-gen1-timed.js'), G1 = E.G1;
  const ctx = T.context(D, G1, 'red', 'dmg');
  const s = T.schedule(G1, ctx, 'poweron', 300, 0, 4, 1.0);
  const blips = s.cues.filter((c) => c.kind === 'menu');
  assert.equal(blips.length, 2, 'the double blip is still a double blip');
  near(blips[0].t, s.menu + ctx.visibleLagS, 'the first blip sits on the box');
  near(s.menuVisible, s.menu + ctx.visibleLagS, 'the schedule names the box time for the protocol to quote');
  near(s.tA, s.menu + G1.targetSeconds(300), 'the A aim is unchanged: both it and menu are counted from the detector');
  assert.ok(s.cues.filter((c) => c.kind === 'count').every((c) => c.t >= s.menuVisible), 'no count-in beep sounds before the box is on screen');
});

test('the Gen 1 storyboard under the menu anchor is zeroed on the box, and agrees with the cue', () => {
  const S = H.page('page-storyboard.js'), T = H.page('page-gen1-timed.js'), G1 = E.G1;
  for (const [game, pk, offset] of [['red', 'gbp', 358], ['yellow', 'gbp', 120]]) {
    const ctx = T.context(D, G1, game, pk), ev = D.scenes.methodologies[ctx.methId].events;
    const tl = S.gen1Timeline(D, ctx.methId, offset, 'menu', 0);
    near(tl.events.find((x) => x.kind === 'menu-visible').t, 0, ctx.methId + ': t = 0 is the box');
    near(tl.events.find((x) => x.kind === 'menu').t, -ctx.visibleLagS, ctx.methId + ': the detector sits before t = 0');
    assert.equal(tl.visibleLagFrames, ev.menu_visible - ev.menu_open, ctx.methId);
    assert.ok(/box being drawn/.test(tl.originLabel), ctx.methId + ': the anchor is named as the box - ' + tl.originLabel);
    near(tl.press.t, T.schedule(G1, ctx, 'menu', offset, 0, 4, 1.0).tA, ctx.methId + ': marker and tone are still the same instant');
  }
});

test('the menu-anchor protocol promises only the beeps that will sound, and names the box', () => {
  const T = H.page('page-gen1-timed.js'), G1 = E.G1;
  const fmt = { s: (x, d) => Number(x).toFixed(d == null ? 2 : d) + ' s', ms: (x) => Math.round(x) + ' ms' };
  const ctx = T.context(D, G1, 'red', 'gbp');
  // offset 0 sits 1.34 s after the detector, which is about half a second after the box: a four-beep count-in
  // one second apart cannot fit, and three of the four are dropped. The sentence used to promise all four.
  const tight = T.schedule(G1, ctx, 'menu', 0, 0, 4, 1.0);
  assert.ok(tight.droppedCountIn > 0, 'offset 0 really is too tight for the whole count-in (dropped ' + tight.droppedCountIn + ')');
  const lines = T.protocolLines(G1, D, ctx, 'menu', tight, { offset: 0, tid: ctx.table[0] }, 0, 4, 1.0, fmt).join('\n');
  const played = 4 - tight.droppedCountIn;
  assert.ok(lines.includes('You will hear ' + played + ' short beep'), 'the protocol counts the beeps that will actually sound, not the four requested:\n' + lines);
  assert.ok(/left out/.test(lines), 'and says why the others are missing');
  assert.ok(lines.includes('frame ' + ctx.visibleFrame), 'the box frame is the one quoted to the runner');
  // a roomy aim keeps all four
  const roomy = T.schedule(G1, ctx, 'menu', 1131, 0, 4, 1.0);
  assert.equal(roomy.droppedCountIn, 0);
  assert.ok(T.protocolLines(G1, D, ctx, 'menu', roomy, { offset: 1131, tid: ctx.table[1131] }, 0, 4, 1.0, fmt).join('\n').includes('You will hear 4 short beeps'));
});

test('giving the lag back does not put any route-valid target out of reach', () => {
  // the menu anchor's tA shrank by three quarters of a second, which for a small enough offset would leave no
  // room between the runner's tap and the press - the engine refuses that rather than scheduling a cue in the
  // past. No target the routes actually use is anywhere near it, and this is the guard that says so.
  const T = H.page('page-gen1-timed.js'), G1 = E.G1;
  const corr = D.gen1.defaults.correction_ms.menu;
  let checked = 0, tightest = Infinity, where = '';
  for (const game of ['red', 'blue', 'yellow']) {
    for (const pk of Object.keys(D.gen1.platforms)) {
      let ctx;
      try { ctx = T.context(D, G1, game, pk); } catch (e) { continue; }
      if (ctx.anchors.indexOf('menu') === -1) continue;
      for (const r of T.routeValid(G1, ctx)) {
        const s = T.schedule(G1, ctx, 'menu', r.offset, corr, D.gen1.defaults.count_in_beeps, D.gen1.defaults.count_in_spacing_s);
        assert.ok(s.tA > 0, ctx.methId + ' offset ' + r.offset + ': a route-valid target must still be cueable');
        if (s.tA < tightest) { tightest = s.tA; where = ctx.methId + ' offset ' + r.offset; }
        checked++;
      }
    }
  }
  assert.ok(checked > 20, 'checked ' + checked + ' route-valid targets');
  assert.ok(tightest > 1.0, 'the tightest is ' + where + ' with ' + tightest.toFixed(2) + ' s of warning');
});
