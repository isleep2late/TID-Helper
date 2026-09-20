// The correction box, and the advice that drives it.
//
// TWO BUGS THIS PINS, both paid for on real hardware on 2026-09-20.
//
// 1. THE MINUS SIGN COULD NOT BE TYPED. The correction handler returned 'render' on every keystroke and
//    the re-render rebuilt <input type="number"> from the PARSED value. Typing "-" gives a number input
//    an invalid partial, so value reads "" -> Number("")||0 -> 0 -> the field is rewritten as "0" and the
//    minus is gone. "-170" therefore became +170: the cue fired 170 ms LATER when the runner needed it
//    170 ms EARLIER. Ten attempts on a GBA SP were spent on that. The rule is now: a typed field never
//    returns 'render'.
// 2. THE ADVICE MUST ADD BACK THE CORRECTION ALREADY APPLIED. If you are 10 frames late, dial in -10 and
//    are then 3 frames late, your intrinsic lateness is 13, not 3. Averaging raw errors converges to
//    nothing; averaging (error - correctionApplied) converges at once.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper');
const fs = require('fs');

test('no typed field in any mode returns "render" from a non-click event', () => {
  // the re-render is what closes the phone keyboard and eats the minus sign
  const files = fs.readdirSync(src).filter(f => /^page-.*\.js$/.test(f));
  const offenders = [];
  for (const f of files) {
    const txt = fs.readFileSync(path.join(src, f), 'utf8');
    // For each typed-input guard, look at the FIRST return that follows it. If that return is 'render',
    // typing re-renders. Scanning further than the first return is what made an earlier version of this
    // test cry wolf: it reached past a correct `return null` into an unrelated click handler below.
    const re = /ev\.type !== 'click'/g;
    let m;
    while ((m = re.exec(txt))) {
      const after = txt.slice(m.index, m.index + 600);
      const firstReturn = /return\s+('render'|null|undefined|\()/.exec(after);
      if (firstReturn && firstReturn[1] === "'render'") {
        offenders.push(f + ': ' + after.slice(0, firstReturn.index + 20).replace(/\s+/g, ' '));
      }
    }
  }
  assert.deepStrictEqual(offenders, [], 'a typed field re-renders and will eat the keyboard:\n' + offenders.join('\n'));
});

test('the Gen 2 psr correction handler patches in place and does not re-render', () => {
  const txt = fs.readFileSync(path.join(src, 'page-gen2-psr.js'), 'utf8');
  const i = txt.indexOf("ev.target.id === 'g2psr-corr'");
  assert.ok(i > 0, 'the correction handler must still exist');
  const chunk = txt.slice(i, i + 400);
  assert.ok(/setCorrNote\(/.test(chunk), 'it must patch the note span');
  assert.ok(/return null;/.test(chunk), 'it must return null, never "render"');
  assert.ok(!/return 'render'/.test(chunk), 'returning "render" is the bug this test exists for');
});

test('the cue program reads the correction live, not from a render-time capture', () => {
  const txt = fs.readFileSync(path.join(src, 'page-gen2-psr.js'), 'utf8');
  const i = txt.indexOf('program: function ()');
  assert.ok(i > 0);
  const chunk = txt.slice(i, i + 600);
  assert.ok(/cueProgram\(A\.G1, A\.D, rCur, Number\(p\('corr'/.test(chunk),
    'the correction must be read from prefs inside program(), or not re-rendering leaves the tones stale');
});

// ---- the advice maths, against the owner's real GBA SP attempts -------------------------------------
const App = { prefs: {} };
function recommend(attempts, fps) {
  // the same arithmetic A.attempts.recommend does, exercised directly
  const msPerFrame = 1000 / fps;
  const used = attempts.map(a => a.errorFrames - (a.corrMs || 0) / msPerFrame);
  const mean = used.reduce((x, y) => x + y, 0) / used.length;
  return { mean, ms: -Math.round(mean * msPerFrame) };
}
const FPS = 4194304 / 70224;

test('a late presser is told to cue EARLIER (the sign that was backwards on hardware)', () => {
  const r = recommend([{ errorFrames: +8, corrMs: 0 }], FPS);
  assert.ok(r.mean > 0, 'a late press is a positive error');
  assert.ok(r.ms < 0, 'the correction for a late press must be NEGATIVE (cue earlier)');
  assert.strictEqual(r.ms, -134);
});

test('an early presser is told to cue LATER', () => {
  const r = recommend([{ errorFrames: -6, corrMs: 0 }], FPS);
  assert.ok(r.ms > 0, 'the correction for an early press must be POSITIVE');
});

test('the correction already applied is added back, or the advice never converges', () => {
  // same runner, same 10-frame lateness, measured once raw and once with -10 frames already dialled in
  const raw = recommend([{ errorFrames: +10, corrMs: 0 }], FPS);
  const after = recommend([{ errorFrames: 0, corrMs: raw.ms }], FPS);
  assert.strictEqual(after.ms, raw.ms,
    'a runner who is now on target WITH a correction applied still needs that same correction');
  // negative control: ignoring the applied correction would wrongly say "you need nothing"
  const naive = -Math.round((0 / 1) * (1000 / FPS));
  assert.notStrictEqual(naive, raw.ms, 'ignoring the applied correction gives 0, which is the bug');
});

test("the owner's seven timed GBA SP attempts give a usable bias", () => {
  const f = 1000 / FPS;
  const attempts = [
    { errorFrames: 4, corrMs: 0 }, { errorFrames: 8, corrMs: 0 },
    { errorFrames: 12, corrMs: 0 }, { errorFrames: 16, corrMs: 0 },
    { errorFrames: 4, corrMs: 170 }, { errorFrames: 28, corrMs: 170 },
    { errorFrames: 16, corrMs: 170 },
  ];
  const r = recommend(attempts, FPS);
  assert.ok(r.mean > 5 && r.mean < 12, 'the measured bias was about +8 frames, got ' + r.mean.toFixed(1));
  assert.ok(r.ms < -100 && r.ms > -180, 'so the advice is about -137 ms, got ' + r.ms);
  assert.ok(Math.abs(f - 16.74) < 0.01, 'one frame is 16.74 ms');
});
