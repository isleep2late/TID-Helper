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
// 2. THE ADVICE MUST ADD BACK THE CORRECTION ALREADY APPLIED. If you are 10 frames late, dial in the
//    correction and are then 3 frames late, your intrinsic lateness is 13, not 3. Averaging raw errors
//    converges to nothing.
// 3. THE SIGN OF BOTH OF THOSE, which was inverted until 2026-09-20 in BOTH the psr page and the shared
//    A.attempts component. The house convention (page-gen1-buffer.js, page-gen3-rs.js, rs.test.cjs) is
//    that the cue fires at press - correction, so POSITIVE cues EARLIER and a late presser needs a
//    POSITIVE number. The recommender returned a negative one AND subtracted the applied correction
//    instead of adding it, and the two mistakes compounded instead of cancelling: over four real rounds
//    on a GBA SP the advice went -170 -> -639 -> -1175 -> -2151 ms while the error went 28 -> 116 frames
//    LATE. Every round made it worse and the app kept confidently recommending more.
//
// The sign tests below therefore run the REAL recommender against the REAL cue program and check the
// loop CLOSES. The previous version of this file reimplemented the arithmetic inline, which is why it
// passed green through all four of those divergent attempts: it was testing a copy, not the code.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper');
const fs = require('fs');

test('typed fields that re-render on every keystroke: the known list, which may only shrink', () => {
  // THE BLIND SPOT. The first version of this test searched for `ev.type !== 'click'` and inspected the
  // first return after it. page-gen1-buffer.js and five other modes branch the other way round -
  // `if (ev.type === 'click') { ... } else { ... }` - so the regex never saw them and the test reported
  // that no typed field re-rendered while thirteen of them did. A guard that only understands the shape
  // its author had in mind is worse than none: it is a green light over a live defect.
  //
  // This walks the MARKUP for every text/number input, finds that id's handler wherever it is, and does
  // not care how the handler is arranged. Re-rendering from a keystroke closes the phone keyboard and
  // scrolls to the top; render() now puts focus, caret and scroll back, which makes these survivable, but
  // the cure is to patch in place like the Gen 2 psr correction does. So they are listed, and the list may
  // only shrink: a NEW one fails, and fixing one without removing it from the list also fails.
  const KNOWN = [
    // page-gen1-buffer.js's two were the first fixed, 2026-09-20: they patch #buffer-results in place.
    'page-gen1-timed.js g1-reset-adjust', 'page-gen1-timed.js g1-reset-pairs', 'page-gen1-timed.js g1-beeps',
    'page-gen2.js g2-beeps',
    'page-gen3-enc.js g3e-got-level', 'page-gen3-enc.js g3e-span', 'page-gen3-enc.js g3e-from',
    'page-gen3-rs.js rs-horizon', 'page-gen3-rs.js rs-beeps',
    'page-gen3-sid.js sid-name', 'page-gen3-sid.js sid-margin',
  ];
  const found = [];
  for (const f of fs.readdirSync(src).filter((x) => /^page-.*\.js$/.test(x))) {
    const txt = fs.readFileSync(path.join(src, f), 'utf8');
    const ids = new Set();
    let m; const tags = /<input[^>]*>/g;
    while ((m = tags.exec(txt))) {
      if (!/type=\\?"(text|number)\\?"/.test(m[0])) continue;
      const id = /id=\\?"([^\\"]+)\\?"/.exec(m[0]);
      if (id && !id[1].includes('+')) ids.add(id[1]);
    }
    for (const id of ids) {
      const i = txt.indexOf("t.id === '" + id + "'");
      if (i < 0) continue;
      const line = txt.slice(i, i + 240).split('\n')[0];
      if (/return 'render'/.test(line)) found.push(f + ' ' + id);
    }
  }
  const added = found.filter((x) => !KNOWN.includes(x));
  const fixed = KNOWN.filter((x) => !found.includes(x));
  assert.deepStrictEqual(added, [], 'NEW typed fields re-render on every keystroke - patch in place instead');
  assert.deepStrictEqual(fixed, [], 'these were fixed - delete them from KNOWN so the list keeps ratcheting');
});

test('render() puts the keyboard, the caret and the scroll position back', () => {
  // the safety net under the list above; without it a keystroke re-render is unusable on a phone
  const r = fs.readFileSync(path.join(src, 'page-render.js'), 'utf8');
  const i = r.indexOf('function render()');
  assert.ok(i > 0);
  const body = r.slice(i, r.indexOf('A.render = render'));
  assert.ok(/activeElement/.test(body), 'render() must notice which field had focus');
  assert.ok(/setSelectionRange/.test(body), 'render() must restore the caret, or the cursor jumps to the start');
  assert.ok(/\.focus\(/.test(body), 'render() must restore focus, or the soft keyboard closes');
  assert.ok(/scrollTo\(0, keepY\)/.test(body), 'render() must restore the scroll position for a typed re-render');
  assert.ok(/scrollTo\(0, 0\)/.test(body), 'a navigation render must still start at the top');
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

// ---- the advice maths, run against the REAL functions ----------------------------------------------
const H = require('./helpers.cjs');
const D = H.data();
const M = H.page('page-gen2-psr.js');
const G1 = H.engines().G1 || require('../../../src/lib/shiny/gen1tid.js');
const TARGET = 28489;                       // the owner's route: plateau 11, two backouts
const m = M.meth(D, 'crystal');
const route = M.routeFor(D, TARGET, 'crystal');
const FPS = M.fps(D);
const MS_PER_FRAME = 1000 / FPS;

// A Trainer ID that this route really produces `offset` frames away from the prescribed wait, taken from
// the shipped reverse table - so the tests below are driven by real rolls, not by invented error values.
function gotAtOffset(offset) {
  const rev = M.reverseTable(m);
  const fi = rev.idx[M.famKey(route)];
  const wi = (route.waitFrames + offset) / rev.step;
  const tid = M.revTidAt(rev, fi, wi);
  assert.ok(tid >= 0, 'the reverse table has no roll at offset ' + offset + ', pick another');
  return tid;
}

test('a late presser is told to cue EARLIER, and the cue actually moves earlier by that much', () => {
  const LATE = 8;
  const rec = M.recommendCorrection(D, m, route, [{ got: gotAtOffset(LATE), corrMs: 0 }]);
  assert.equal(rec.n, 1);
  assert.ok(rec.meanFrames > 0, 'a late press is a positive error');
  assert.ok(rec.ms > 0, 'the correction for a late press must be POSITIVE - positive cues earlier');
  assert.strictEqual(rec.ms, Math.round(LATE * MS_PER_FRAME));
  // THE CLOSED LOOP: feed the recommendation to the real cue and check the press tone moved EARLIER,
  // by the error it was meant to cancel. This is the assertion the old inline version could not make.
  const base = M.cueProgram(G1, D, route, 0, 4, 1.0).tPress;
  const fixed = M.cueProgram(G1, D, route, rec.ms, 4, 1.0).tPress;
  assert.ok(fixed < base, 'the recommendation must move the press tone EARLIER for a late presser');
  assert.ok(Math.abs((base - fixed) - LATE / FPS) < 0.5 / FPS,
    'it must move by the measured error, not some other amount');
});

test('an early presser is told to cue LATER, and the cue moves later', () => {
  const rec = M.recommendCorrection(D, m, route, [{ got: gotAtOffset(-8), corrMs: 0 }]);
  assert.ok(rec.meanFrames < 0, 'an early press is a negative error');
  assert.ok(rec.ms < 0, 'the correction for an early press must be NEGATIVE');
  const base = M.cueProgram(G1, D, route, 0, 4, 1.0).tPress;
  const fixed = M.cueProgram(G1, D, route, rec.ms, 4, 1.0).tPress;
  assert.ok(fixed > base, 'the recommendation must move the press tone LATER for an early presser');
});

test('the loop CONVERGES: a runner with a fixed bias is corrected, not driven away', () => {
  // exactly what happened on hardware: a runner who is consistently N frames late takes the advice each
  // round. With the signs inverted this walked 20 -> 40 -> 80 frames late. It must walk to zero.
  const INTRINSIC = 20;                       // frames late, a multiple of the 4-frame poll period
  let corr = 0;
  const attempts = [], seen = [];
  for (let round = 0; round < 4; round++) {
    // a positive correction cues earlier, so it removes that many frames from the runner's lateness
    const err = Math.round(INTRINSIC - corr / MS_PER_FRAME);
    seen.push(err);
    attempts.push({ got: gotAtOffset(err), corrMs: corr });
    corr = M.recommendCorrection(D, m, route, attempts).ms;
  }
  assert.ok(Math.abs(seen[seen.length - 1]) <= 2,
    'the error must converge on the target; it went ' + seen.join(' -> ') + ' frames');
  assert.ok(Math.abs(seen[seen.length - 1]) < Math.abs(seen[0]),
    'the error must shrink, not grow: ' + seen.join(' -> '));
});

test("the owner's four real diverging attempts recover one consistent bias", () => {
  // got, and the correction that was in the box at the time, straight off the phone on 2026-09-20
  const real = [[22097, -170], [5901, -639], [27232, -1175], [4010, -1666]];
  const rec = M.recommendCorrection(D, m, route, real.map(([got, corrMs]) => ({ got, corrMs })));
  assert.equal(rec.n, 4, 'all four were timing misses on this route');
  // Under the fixed signs these four collapse onto one bias of about 19-20 frames. Under the broken ones
  // they read as 128.5 frames with a 177-frame spread, which is what the phone showed.
  assert.ok(rec.meanFrames > 14 && rec.meanFrames < 25,
    'the four attempts must recover one consistent bias, got ' + rec.meanFrames.toFixed(1) + ' frames');
  assert.ok(rec.spreadFrames < 15,
    'a spread of ' + rec.spreadFrames.toFixed(1) + ' frames means the model still does not fit');
  assert.ok(rec.ms > 250 && rec.ms < 450, 'the advice should be about +330 ms, got ' + rec.ms);
});

test('both recommenders agree: the shared component and the psr page use the same signs', () => {
  const A = H.app();
  const attempts = [{ got: gotAtOffset(12), corrMs: -100 }];
  const mine = M.recommendCorrection(D, m, route, attempts);
  // drive A.attempts.recommend over the same attempts through a locate() backed by the same diagnosis
  const o = {
    section: 'test', game: 'crystal', targetKey: String(TARGET), fps: FPS, corrMs: -100,
    locate: (got) => {
      const d = M.diagnose(m, route, got);
      if (d.kind === 'target') return { kind: 'target', errorFrames: 0 };
      if (d.kind === 'wait') return { kind: 'timing', errorFrames: d.errorFrames };
      return { kind: 'other' };
    },
  };
  A.attempts.set(o, attempts);
  const theirs = A.attempts.recommend(o);
  assert.strictEqual(theirs.ms, mine.ms,
    'the two implementations disagree (' + theirs.ms + ' vs ' + mine.ms + ') - one of them has the sign back to front');
  assert.ok(Math.abs(theirs.meanFrames - mine.meanFrames) < 1e-9, 'the two implementations disagree on the bias');
});
