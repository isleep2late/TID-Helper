// The SC Metronome's pure half: the beat pattern, the flash-rate ceiling, the tap statistics and the
// frame-sized nudge. The UI half needs a DOM and is not exercised here; what IS exercised is every rule
// that decides whether the screen is allowed to flash, because that decision must not depend on a
// checkbox and must hold for patterns nobody thought to try.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const M = H.page('page-sc-metronome.js');
const ORDER = ['RESET', 'A'];

test('the frame is the Game Boy frame, and a nudge is exactly one of them', () => {
  assert.ok(Math.abs(M.FRAME_MS - 16.7427) < 0.001, 'one frame is 16.7427 ms');
  assert.ok(Math.abs(M.nudge(200, 1) - (200 + M.FRAME_MS)) < 1e-9);
  assert.ok(Math.abs(M.nudge(200, -1) - (200 - M.FRAME_MS)) < 1e-9);
  // a whole number of frames is the only correction the hardware can express; a round 10 ms is not one
  assert.notEqual(Math.round(M.nudge(200, 1)), 210);
});

test('pair mode is the attempt: two beats interval apart, then the wait - not an even tick', () => {
  const p = M.pattern('pair', 199.2, 2.0, ORDER);
  assert.equal(p.beats.length, 2);
  assert.equal(p.beats[0].label, 'RESET');
  assert.equal(p.beats[1].label, 'A');
  assert.ok(Math.abs(p.beats[1].t - 0.1992) < 1e-9, 'the second beat is the interval, in seconds');
  assert.equal(p.periodS, 2.0, 'and the pair repeats on the attempt cadence, not on the interval');
});

test('an attempt can never be shorter than the pair inside it', () => {
  const p = M.pattern('pair', 900, 0.5, ORDER);   // cadence below the interval
  assert.ok(p.periodS >= 0.9 + 0.1, 'the cadence is raised to fit the pair plus a margin');
});

test('even mode drills the bare gap: one beat per interval', () => {
  const p = M.pattern('even', 199.2, 2.0, ORDER);
  assert.equal(p.beats.length, 1);
  assert.ok(Math.abs(p.periodS - 0.1992) < 1e-9);
});

test('flashes per second counts the BURST, not one over the gap', () => {
  // The two beats of a pair sit ~200 ms apart and then nothing happens for the rest of the attempt, so a
  // one-second window holds 2 - not the 5 that 1/gap would suggest.
  assert.equal(M.flashesPerSecond(M.pattern('pair', 199.2, 2.0, ORDER)), 2);
  // An even tick at the same interval really is fast: five gaps a second.
  assert.ok(M.flashesPerSecond(M.pattern('even', 199.2, 2.0, ORDER)) > 3);
});

test('WCAG 2.3.1 is enforced in code: more than three flashes a second can never be full-screen', () => {
  const fast = M.pattern('even', 199.2, 2.0, ORDER);
  const plan = M.flashPlan(fast);
  assert.equal(plan.allowed, 'indicator');
  assert.ok(plan.fps > 3);
  assert.match(plan.reason, /three in any one second|WCAG/i);
});

test('a pair is inside the count limit but still too fast for the whole screen', () => {
  const plan = M.flashPlan(M.pattern('pair', 199.2, 2.0, ORDER));
  assert.equal(plan.fps, 2, 'two flashes in a second is within the hard limit');
  assert.equal(plan.allowed, 'indicator', 'but 199 ms apart is too fast to throw across the viewport');
});

test('a slow enough pattern is allowed the full screen', () => {
  const slow = M.pattern('even', 1000, 2.0, ORDER);
  const plan = M.flashPlan(slow);
  assert.equal(plan.allowed, 'fullscreen');
  assert.ok(plan.fps <= 3);
});

test('the flash decision never depends on an interval nobody tried: sweep it', () => {
  for (let ms = 40; ms <= 3000; ms += 20) {
    for (const mode of ['pair', 'even']) {
      const plan = M.flashPlan(M.pattern(mode, ms, 2.0, ORDER));
      assert.ok(plan.allowed === 'fullscreen' || plan.allowed === 'indicator');
      if (plan.fps > 3) assert.equal(plan.allowed, 'indicator', mode + ' at ' + ms + ' ms: ' + plan.fps + ' flashes/s must not be full-screen');
      if (plan.allowed === 'fullscreen') {
        assert.ok(plan.fps <= 3, mode + ' at ' + ms + ' ms went full-screen at ' + plan.fps + ' flashes/s');
        assert.ok(M.minGapS(M.pattern(mode, ms, 2.0, ORDER)) >= 0.5, mode + ' at ' + ms + ' ms went full-screen with a gap under half a second');
      }
    }
  }
});

test('capture: the median of the gaps, and four taps before it is usable', () => {
  assert.equal(M.capture([0, 200, 399, 601]).medianMs, 200);
  assert.equal(M.capture([0, 200, 399, 601]).ok, true);
  assert.equal(M.capture([0, 200]).ok, false, 'two taps is one gap, so one slip is the whole answer');
  assert.equal(M.capture([0, 200, 400]).ok, false, 'three taps is two gaps: still not enough');
  assert.equal(M.capture([]).ok, false);
  assert.equal(M.capture(null).ok, false);
});

test('capture: one wild tap moves the median far less than it moves a mean', () => {
  const stamps = [0, 200, 400, 600, 1400];   // the last gap is a slip of 800 ms
  const c = M.capture(stamps);
  assert.equal(c.medianMs, 200, 'the median ignores the slip');
  const mean = (c.gaps.reduce((a, b) => a + b, 0)) / c.gaps.length;
  assert.ok(mean > 300, 'where a mean would have been dragged to ' + Math.round(mean) + ' ms');
});

test('capture reports the spread in frames, so an unsteady hand is visible', () => {
  const c = M.capture([0, 200, 399, 601]);
  assert.ok(c.spreadMs === 3);
  assert.ok(Math.abs(c.spreadFrames - 3 / M.FRAME_MS) < 1e-9);
});

test('the "too early" correction goes OPPOSITE ways on the two reset models', () => {
  // gbp-fade is ["RESET","A"]: the console runs on through a fade, so the reset instant lands at
  // (fade - interval) into the save. Waiting longer before A puts the reset EARLIER, so a reset that was
  // too early means the interval was too LONG.
  assert.equal(M.resetIsFirst(['RESET', 'A']), true);
  assert.ok(M.correctionFrames(['RESET', 'A'], 3) < 0, 'reset first -> shorten');
  // power-off is ["A","POWER OFF"]: the power goes off at (interval) into the save, so waiting longer puts
  // it LATER. Too early means the interval was too SHORT.
  assert.equal(M.resetIsFirst(['A', 'POWER OFF']), false);
  assert.ok(M.correctionFrames(['A', 'POWER OFF'], 3) > 0, 'reset second -> lengthen');
  // and the two really do move the number in opposite directions from the same starting point
  const gbp = M.nudge(199.2, M.correctionFrames(['RESET', 'A'], 3));
  const off = M.nudge(199.2, M.correctionFrames(['A', 'POWER OFF'], 3));
  assert.ok(gbp < 199.2 && off > 199.2, 'a single hard-coded sign would be wrong on one of these two');
});

test('the correction is always a whole number of frames, whichever way it goes', () => {
  for (const order of [['RESET', 'A'], ['A', 'POWER OFF']]) {
    for (const n of [1, 2, 3, 5]) {
      const f = M.correctionFrames(order, n);
      assert.equal(Math.abs(f), n);
      assert.ok(Math.abs(Math.abs(M.nudge(200, f) - 200) - n * M.FRAME_MS) < 1e-9);
    }
  }
});
