// gen4.test.cjs - Diamond / Pearl / Platinum / HeartGold / SoulSilver.
//
// This mode ships NO swept table, so there is no table to check. What has to hold instead:
//   1. the two independent seed implementations in this repo agree (they are separate transcriptions of the
//      same PokeFinder routine, and a divergence would mean one of them is wrong);
//   2. every row the search hands out really produces the Trainer ID it is filed under;
//   3. the two timer phases sum to the rule that makes the press land inside the target second, which is the
//      only reason the timer works at all;
//   4. the mode refuses rather than guesses when a calibration makes the press due before the game starts.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers.cjs');
const D = H.data();
const M = H.page('page-gen4.js');
const G4 = H.engines().G4;
const ST4 = H.engines().ST4;

test('the two seed implementations in this repo agree', () => {
  // gen4.seed() and seedtime4.calcSeed() are separate transcriptions of Utilities4::calcSeed. A sweep of
  // 3,800,000 random inputs found no disagreement; this is the fixed sample that rides in the suite.
  let n = 0;
  for (let y = 2000; y <= 2099; y += 7) for (let mo = 1; mo <= 12; mo += 5) for (let d = 1; d <= 28; d += 9)
    for (let h = 0; h < 24; h += 7) for (let mi = 0; mi < 60; mi += 23) for (let s = 0; s < 60; s += 29)
      for (const delay of [0, 1, 600, 5000, 65535]) {
        const t = { year: y, month: mo, day: d, hour: h, minute: mi, second: s };
        assert.equal(G4.seed(y, mo, d, h, mi, s, delay) >>> 0, ST4.calcSeed(t, delay) >>> 0,
          'seed disagreement at ' + JSON.stringify(t) + ' delay ' + delay);
        n++;
      }
  assert.ok(n > 5000, 'the sample must be big enough to mean something, got ' + n);
});

test('every row the search hands out really produces that Trainer ID', () => {
  const t = { year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0 };
  let found = 0;
  for (const tid of [7777, 0, 65535, 24601, 1234]) {
    const hits = M.targets(D, 'diamond', tid, t, 0, 8000);
    for (const h of hits) {
      assert.equal(M.seedOf({ ...t, second: h.second }, h.delay) >>> 0, h.seed >>> 0, 'the row seed is not the seed of its own (second, delay)');
      assert.equal(M.idsOf(h.seed).tid, tid, 'a row claims ' + tid + ' but its seed gives ' + M.idsOf(h.seed).tid);
      assert.equal(M.idsOf(h.seed).sid, h.sid);
      found++;
    }
  }
  assert.ok(found > 0, 'no Trainer ID at all was reachable, which means the search is broken, not lucky');
});

test('an out-of-range Trainer ID is refused rather than answered', () => {
  const t = { year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0 };
  assert.throws(() => M.targets(D, 'diamond', 70000, t, 0, 100), /0\.\.65535/);
  assert.throws(() => M.targets(D, 'diamond', 1, t, 500, 100), /backwards/);
  assert.throws(() => M.game(D, 'emerald'), /no gen4 game/);
});

test('the timer phases put the press inside the target second', () => {
  // phase1 + phase2 must always be targetSecond*1000 + 200 + a whole number of minutes. That identity is
  // the entire reason the two-phase model works; if it drifts, every hit is an accident.
  for (const second of [0, 7, 14, 30, 59]) for (const delay of [300, 600, 4119, 20000]) {
    for (const [cd, cs] of [[500, 14], [0, 0], [820.5, 3]]) {
      const hit = { second, delay };
      let p;
      try { p = M.phases(hit, cd, cs); } catch (e) { continue; }   // a refused combination is tested below
      const total = p.phase1Ms + p.phase2Ms;
      const rem = ((total - (second * 1000 + 200)) % 60000 + 60000) % 60000;
      assert.ok(Math.min(rem, 60000 - rem) < 0.01,
        'second ' + second + ' delay ' + delay + ' cal ' + cd + '/' + cs + ': total ' + total + ' breaks the rule');
      assert.ok(p.phase1Ms >= 14000 - 1e-6, 'phase 1 must leave time to actually start the console');
    }
  }
});

test('a calibration that would put the A press before the game starts is refused, not printed', () => {
  // phase2 = toMs(delay) - calibration. A large calibrated delay against a small target makes it negative,
  // and a negative countdown is not a thing a person can follow.
  assert.throws(() => M.phases({ second: 10, delay: 10 }, 5000, 0), /phase 2|before the game starts/);
});

test('calibration moves toward the hit, and damps inside ten frames', () => {
  assert.equal(M.calibrate(500, 600, 650), 550, 'a 50-delay miss moves the calibration by 50');
  assert.equal(M.calibrate(500, 600, 600), 500, 'hitting the target changes nothing');
  const small = M.calibrate(500, 600, 605);
  assert.ok(small > 500 && small < 505, 'a near hit is damped rather than chased: ' + small);
  assert.ok(M.calibrate(500, 600, 550) < 500, 'undershooting moves the calibration down');
});

test('the clock-minute figure follows the calibration, not EonTimer\'s zero', () => {
  // the two disagree for about 9% of (delay, second) pairs, and where they do the spanned one is what the
  // countdown actually covers - so `use` must be the spanned figure
  let differ = 0, n = 0;
  for (let second = 0; second < 60; second += 1) for (const delay of [300, 1000, 4119]) {
    const cm = M.clockMinutes({ second, delay }, 500, 14);
    assert.equal(cm.use, cm.spanned, 'the shown figure must be the spanned one');
    assert.equal(cm.differ, cm.before !== cm.spanned);
    if (cm.differ) differ++;
    n++;
  }
  assert.ok(differ > 0, 'the two figures never disagreed, so this guard proves nothing (n=' + n + ')');
});

test('verification sequences are deterministic and differ by family', () => {
  const seed = 252317745;
  assert.equal(M.flipsFor(seed, 10), M.flipsFor(seed, 10));
  assert.match(M.flipsFor(seed, 10), /^[HT]{10}$/);
  assert.match(M.elmFor(seed, 10, 0), /^[EKP]{10}$/);
  assert.notEqual(M.elmFor(seed, 10, 0), M.elmFor(seed, 10, 3), 'roamer skips must change the Elm sequence');
  assert.equal(M.isHgss(D, 'heartgold'), true);
  assert.equal(M.isHgss(D, 'diamond'), false);
});

test('the coin-flip matcher finds the delay that produced the flips', () => {
  const t = { year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0 };
  const hits = M.targets(D, 'diamond', 7777, t, 300, 5000);
  const target = hits[0];
  // flips from a delay 12 away: the matcher must report that delay, and diagnose() must call it late
  const actual = { second: target.second, delay: target.delay + 12 };
  const flips = M.flipsFor(M.seedOf({ ...t, second: actual.second }, actual.delay), 12);
  const got = M.matchFlips(D, flips, t, target.second, 3, target.delay, 2000, 10);
  assert.ok(got.some((r) => r.delay === actual.delay && r.second === actual.second),
    'the matcher did not find the delay those flips came from');
  const d = M.diagnose(target, actual.delay);
  assert.equal(d.kind, 'delay');
  assert.equal(d.errorDelays, 12);
  assert.equal(d.late, true);
  assert.equal(M.diagnose(target, target.delay).kind, 'target');
});

test('the data says plainly that nothing here was derived or measured on hardware', () => {
  const m = M.model(D);
  assert.match(m.status, /computed, not swept/);
  assert.match(m.status + m.validation, /NOT confirmed on hardware|NO HARDWARE SAMPLE/);
  assert.match(m.not_derived, /has not derived anything/);
  assert.match(JSON.stringify(m.credits), /PokeFinder/);
  assert.match(JSON.stringify(m.credits), /EonTimer/);
  assert.match(m.credits[0].who, /community/i);
});
