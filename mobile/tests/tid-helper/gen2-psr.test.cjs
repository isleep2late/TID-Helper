// gen2-psr.test.cjs - the multi-step Crystal/GBP methodology (gen2-psr.json, page-gen2-psr.js).
//   1. the packed tables decode to the sizes the page indexes, and the coverage the data prints is the bitmap's own popcount
//   2. every stored route is inside the ranges the code layout allows, so no lookup can name a plateau that does not exist
//   3. CROSS-FILE: a route that uses no backouts on the first plateau is the single-press protocol, so its three IDs must
//      appear together in the SHIPPED gen2-tid.json crystal-gbp table. This is what keeps the new methodology honest
//      against the old one inside the test suite, not just inside the data generator.
//   4. the printed script says the things a person has to do (hold the window, hold the A out)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers.cjs');

const D = H.data();
const M = H.page('page-gen2-psr.js');
const GAMES = Object.keys(D.gen2psr.games);

test('gen2-psr.json: the packed tables decode to the sizes the page indexes, and coverage matches the bitmap', () => {
  assert.ok(GAMES.length >= 1, 'at least one game has a psr table');
  for (const game of GAMES) {
  const m = M.meth(D, game);
  const t = M.tables(m);
  assert.equal(t.code.length, 65536 * 3);
  assert.equal(t.lid.length, 65536 * 2);
  // sid is absent for games with no Secret ID; present exactly when rolls says so
  assert.equal(!!t.sid, m.rolls.includes('sid'), game + ': the sid table is present iff the game rolls one');
  if (t.sid) assert.equal(t.sid.length, 65536 * 2);
  assert.equal(t.bm.length, 8192);
  let pop = 0;
  for (let i = 0; i < 65536; i++) if (M.covered(m, i)) pop++;
  assert.equal(pop, m.coverage.tids_covered, 'coverage.tids_covered is the number of set bits');
  assert.equal(m.coverage.tids_total, 65536);
  assert.ok(Math.abs(m.coverage.percent - pop * 100 / 65536) < 0.01);
  assert.ok(pop > 60000, game + ': the sweep is meant to cover almost every Trainer ID, got ' + pop);
  }
});

test('every stored route is inside the ranges the code layout allows', () => {
  for (const game of GAMES) {
  const m = M.meth(D, game);
  let n = 0;
  for (let tid = 0; tid <= 0xFFFF; tid++) {
    const r = M.routeFor(D, tid, game);
    if (!r) { assert.ok(!M.covered(m, tid)); continue; }
    n++;
    assert.equal(r.tid, tid);
    assert.ok(r.plateauIndex >= 0 && r.plateauIndex < m.plateaus.length, 'plateau index ' + r.plateauIndex);
    assert.equal(r.plateau, m.plateaus[r.plateauIndex]);
    assert.ok(r.pre >= 0 && r.pre <= 2, 'pre ' + r.pre);
    assert.ok(r.post >= 0 && r.post <= 2, 'post ' + r.post);
    assert.equal(typeof r.opt, 'boolean');
    assert.ok(r.waitFrames >= 0 && r.waitFrames <= m.wait_max_frames && r.waitFrames % 4 === 0, game + ' W ' + r.waitFrames);
    assert.ok(r.lid >= 0 && r.lid <= 0xFFFF && r.sid >= 0 && r.sid <= 0xFFFF);
    assert.ok(r.plateau.hold_lo_frame <= r.plateau.hold_hi_frame);
    assert.equal(r.plateau.width_frames, r.plateau.hold_hi_frame - r.plateau.hold_lo_frame + 1);
  }
  assert.equal(n, m.coverage.tids_covered);
  }
});

test('a no-backout route on the first plateau IS the single press, so its IDs are in the shipped gen2-tid.json table', () => {
  const hex = (v) => v.toString(16).toUpperCase().padStart(4, '0');
  for (const game of GAMES) {
  const s = D.gen2.methodologies[game + '/gbp/hold-start-v1'].table_data;
  const shipped = new Set();
  // Gold and Silver have no Secret ID, so their shipped table carries no sids_hex
  for (let b = 0; b < s.bins; b++) shipped.add(s.tids_hex.substr(b * 4, 4) + s.lids_hex.substr(b * 4, 4)
    + (s.sids_hex ? s.sids_hex.substr(b * 4, 4) : '0000'));
  // only where the two overlap: the shipped table stops at offset_max, this sweep waits further out
  let checked = 0, beyond = 0, exact = 0, nearMiss = 0;
  for (let tid = 0; tid <= 0xFFFF; tid++) {
    const r = M.routeFor(D, tid, game);
    if (!r || r.plateauIndex !== 0 || r.pre || r.post || r.opt) continue;
    if (r.waitFrames > s.offset_max) { beyond++; continue; }
    checked++;
    const key = hex(r.tid) + hex(r.lid) + hex(r.sid);
    if (shipped.has(key)) { exact++; continue; }
    // Crystal must match outright. Gold and Silver legitimately differ, because the single-press
    // derivation TAPS the NEW GAME press for 8 frames and releases it while this method HOLDS it out,
    // which shifts the Gen 2 RNG a step or two. Per-bin evidence for that lives in the data's own
    // crosscheck block and is asserted in the next test - here we only require Crystal to be exact.
    assert.notEqual(game, 'crystal',
      'crystal: psr route for ' + hex(tid) + ' uses no backouts on the power-on hold, so the shipped '
      + 'single-press table must contain the same three IDs together - it does not');
    nearMiss++;
  }
  assert.ok(checked > 100, game + ': expected a few hundred overlapping degenerate routes to cross-check, got ' + checked);
  if (game === 'crystal') assert.equal(nearMiss, 0, 'crystal must match exactly, not approximately');
  else assert.ok(exact > 0, game + ': the held-out press should still agree with the tap on some routes, got ' + exact);
  assert.ok(beyond > 0, game + ': this sweep waits past the shipped table, so some routes should sit beyond offset_max');
  }
});

test('the printed script tells a person what is timed and to hold the A out', () => {
  for (const game of GAMES) {
  const pick = (f) => { for (let t = 0; t <= 0xFFFF; t++) { const r = M.routeFor(D, t, game); if (r && f(r)) return r; } return null; };
  const covered = pick(() => true);
  assert.ok(covered, game + ' has at least one covered Trainer ID');
  const lines = M.scriptLines(D, covered).join(' ');
  assert.match(lines, /HOLD IT DOWN/, 'the NEW GAME press is held out, which is the point of the method');
  assert.match(lines, /Clear the save data/);
  assert.match(lines, /START/);
  // a route with a wait must name the poll window; one without must say so
  const withWait = pick((r) => r.waitFrames > 0);
  assert.match(M.scriptLines(D, withWait).join(' '), /land inside a 4-frame window/);
  // the first plateau starts at power-on, so its script must not ask for a timed START
  const onPlateau0 = pick((r) => r.plateauIndex === 0);
  assert.match(M.scriptLines(D, onPlateau0)[1], /nothing to time here/);
  }
});

test('an uncovered Trainer ID returns null rather than a wrong script, and out-of-range throws', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    let missing = null;
    for (let tid = 0; tid <= 0xFFFF && missing === null; tid++) if (!M.covered(m, tid)) missing = tid;
    assert.notEqual(missing, null, game + ': the sweep does not cover everything, so there is one to find');
    assert.equal(M.routeFor(D, missing, game), null);
    assert.throws(() => M.routeFor(D, 65536, game), /0\.\.65535/);
    assert.throws(() => M.routeFor(D, -1, game), /0\.\.65535/);
    assert.throws(() => M.routeFor(D, 1.5, game), /0\.\.65535/);
  }
});

// ---- the printed script must match what the harness actually did ------------------------------------
// Each of these pins a defect found by review that would have handed a runner a different Trainer ID
// with no way to notice. gen2tid.cpp is the authority; these assert the page agrees with it.

test('the backout step never tells the runner to wait for the title screen', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    const r = (() => { for (let t = 0; t <= 0xFFFF; t++) { const x = M.routeFor(D, t, game); if (x && x.pre + x.post > 0) return x; } })();
    assert.ok(r, game + ' has a route with a backout');
    const line = M.scriptLines(D, r).find((x) => /Back out/.test(x));
    assert.ok(line, game + ': a route with a backout prints a backout line');
    // the harness holds B for backout_b_frames then switches to START, ~40 frames before the title is visible
    assert.doesNotMatch(line, /until the title/i, game + ': the backout line must not name the title screen as the cue - ' + line);
    assert.match(line, new RegExp(String(m.backout_b_frames) + ' frames'), game + ': the backout line states the frame count');
    assert.match(line, /Do NOT wait for the title screen/, game + ': the backout line warns against the wrong cue');
    // and the data's own steps must agree with the page
    const step = m.steps.find((x) => /Back out/.test(x));
    assert.doesNotMatch(step, /until the title/i, game + ': the data steps must not say it either');
  }
});

test('the wait is printed from the VISIBLE menu box, not the detector 4 frames earlier', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    assert.match(m.wait_anchor, /DETECTOR/, game + ': the data explains the anchor');
    const r = (() => { for (let t = 0; t <= 0xFFFF; t++) { const x = M.routeFor(D, t, game); if (x && x.waitFrames >= 100) return x; } })();
    const line = M.scriptLines(D, r).find((x) => /Wait /.test(x));
    // the stored W counts from the detector; the box is 4 frames later, so the printed number is W-4
    assert.match(line, new RegExp('Wait ' + (r.waitFrames - 4) + ' frames'),
      game + ': the printed wait must be the stored ' + r.waitFrames + ' minus the 4-frame menu lag - ' + line);
    assert.match(line, new RegExp('stored as ' + r.waitFrames + ' frames'), game + ': and must say what the stored figure is');
  }
});

test('the OPTION step states the DOWN-to-A gap, which is timed', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    const r = (() => { for (let t = 0; t <= 0xFFFF; t++) { const x = M.routeFor(D, t, game); if (x && x.opt) return x; } })();
    if (!r) continue;
    const line = M.scriptLines(D, r).find((x) => /OPTION/.test(x));
    assert.match(line, new RegExp('A ' + m.option_down_to_a_frames + ' frames later'), game + ': the OPTION line gives the gap - ' + line);
    assert.match(line, /timed/, game + ': and says it is timed');
  }
});

test('only Crystal prints a Secret ID: the guard is structural, not a substring test on prose', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    assert.ok(Array.isArray(m.rolls), game + ': rolls is a list');
    assert.equal(m.rolls.includes('sid'), game === 'crystal', game + ': only Crystal rolls a Secret ID');
    // the trap: Gold/Silver `predicts` CONTAINS the phrase "Secret ID" inside the clause denying there is one
    if (game !== 'crystal') assert.match(m.predicts, /Secret ID/,
      'this asserts the TRAP still exists, so nobody reintroduces a substring test on predicts');
  }
});

test('the step list says the console is powered off first, so frame 0 has a meaning', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    assert.match(m.steps[0], /POWER THE CONSOLE OFF|power the console off/i, game + ': step 1 establishes the frame-0 origin');
    const r = (() => { for (let t = 0; t <= 0xFFFF; t++) { const x = M.routeFor(D, t, game); if (x) return x; } })();
    assert.match(M.scriptLines(D, r)[0], /turn the console OFF/i, game + ': and the printed script says so too');
  }
});

test('the recorded cross-check is sane: every bin compared, and no disagreement bigger than a few RNG steps', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    const c = m.crosscheck;
    assert.ok(c, game + ': the data records what the cross-check found');
    const bins = D.gen2.methodologies[game + '/gbp/hold-start-v1'].table_data.bins;
    assert.ok(c.bins_compared >= 0.8 * bins,
      game + ': only ' + c.bins_compared + ' of ' + bins + ' bins were compared - too few to have checked anything');
    assert.equal(c.identical + c.differ_by_one_rng_step, c.bins_compared, game + ': the counts add up');
    // this is the one that matters: a broken sweep moves a byte by ~64, not by a couple
    assert.equal(c.differ_more, 0,
      game + ': ' + c.differ_more + ' disagreements are bigger than a few RNG steps, which is a broken sweep, '
      + 'not the held-out-versus-tapped press');
    if (game === 'crystal') assert.equal(c.differ_by_one_rng_step, 0, 'crystal is RNG-immune here and must match exactly');
    else assert.ok(c.identical > 0, game + ': the held-out press should still agree with the tap on some bins');
  }
});

// ---- (Trainer ID, Lucky ID) pair targeting -----------------------------------------------------------
// OceanBagel's first complaint was that the helper could not find a manip for specific TID/LID values.
// One route per Trainer ID answers only 22.5% of the pairs the sweep actually reaches, so Crystal ships
// an index of the alternates. These tests pin that it is complete and internally consistent.

test('the pair index is internally consistent and addresses every pair the sweep reached', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    const a = M.altTables(m);
    if (!a) { assert.equal(m.alt_pairs, 0, game + ': no index means no claimed pairs'); continue; }
    assert.equal(a.cnt.length, 65536);
    assert.equal(a.st.length, a.pairs * 5, game + ': stream length matches the counts');
    assert.equal(a.pairs, m.alt_pairs, game + ': alt_pairs matches the index');
    // offsets are a prefix sum, so the last one is the total and every TID's slice is in range
    assert.equal(a.off[65536], a.pairs);
    for (let t = 0; t < 65536; t += 977) assert.ok(a.off[t] <= a.off[t + 1] && a.off[t + 1] <= a.pairs, game + ': offsets are monotonic at ' + t);
    // an alternate never repeats the primary Lucky ID, or the same pair would have two routes
    let checked = 0;
    for (let t = 0; t < 65536; t += 313) {
      const lids = M.lidsFor(D, t, game);
      if (!lids.length) continue;
      checked++;
      assert.ok(lids[0].primary, game + ': the primary route comes first');
      assert.equal(new Set(lids.map((x) => x.lid)).size, lids.length, game + ': Lucky IDs are distinct for TID ' + t);
    }
    assert.ok(checked > 100, game + ': sampled enough Trainer IDs, got ' + checked);
  }
});

test('an exact (Trainer ID, Lucky ID) pair returns a route, and an unreachable one returns null', () => {
  const m = M.meth(D, 'crystal');
  if (!M.altTables(m)) return;
  let tested = 0;
  for (let t = 0; t < 65536 && tested < 200; t += 271) {
    const lids = M.lidsFor(D, t, 'crystal');
    if (lids.length < 2) continue;
    tested++;
    for (const { lid } of lids) {
      const r = M.routeForPair(D, t, lid, 'crystal');
      assert.ok(r, 'crystal: pair (' + t + ',' + lid + ') is listed as reachable so it must resolve');
      assert.equal(r.tid, t);
      assert.equal(r.lid, lid, 'the route returned is for the Lucky ID asked for');
      assert.ok(r.plateau && r.waitFrames % 4 === 0 && r.waitFrames <= m.wait_max_frames);
      // and it must print a script without throwing
      assert.ok(M.scriptLines(D, r).length >= 3);
    }
    // a Lucky ID this Trainer ID cannot reach must be refused, not approximated
    const reachable = new Set(lids.map((x) => x.lid));
    let miss = 0; while (reachable.has(miss)) miss++;
    assert.equal(M.routeForPair(D, t, miss, 'crystal'), null, 'crystal: an unreachable pair returns null');
  }
  assert.ok(tested > 50, 'tested enough multi-Lucky-ID Trainer IDs, got ' + tested);
});

test('Crystal addresses far more pairs than one-route-per-Trainer-ID would', () => {
  const m = M.meth(D, 'crystal');
  const a = M.altTables(m);
  assert.ok(a, 'crystal ships the pair index');
  const addressable = a.pairs + m.coverage.tids_covered;
  assert.ok(addressable > 250000, 'crystal addresses ' + addressable + ' pairs');
  assert.ok(addressable > 4 * m.coverage.tids_covered,
    'the index is worth its bytes: ' + addressable + ' pairs against ' + m.coverage.tids_covered + ' Trainer IDs');
});

// ---- cartridge-clock states --------------------------------------------------------------------------
// Gold and Silver pick a table by the clock's day bracket. A runner who resets repeatedly is only ever in
// days0 or days512, and reading the wrong one silently returns another state's Trainer ID.

test('only the RTC-dependent games carry extra clock states, and each is a complete, distinct table', () => {
  for (const game of GAMES) {
    const m = M.meth(D, game);
    const states = M.rtcStates(m);
    assert.ok(states.includes('days0'), game + ': days0 is always the top-level table');
    if (game === 'crystal') {
      assert.deepEqual(states, ['days0'], 'crystal is RTC-immune and must ship no extra clock state');
      continue;
    }
    assert.ok(states.includes('days512'), game + ': the day-carry state ships');
    for (const st of states) {
      const src = M.tableSource(m, st);
      const t = M.tables(m, st);
      assert.equal(t.code.length, 65536 * 3, game + '/' + st);
      assert.equal(t.lid.length, 65536 * 2, game + '/' + st);
      let pop = 0;
      for (let i = 0; i < 65536; i++) if (M.covered(m, i, st)) pop++;
      assert.equal(pop, src.coverage.tids_covered, game + '/' + st + ': coverage matches the bitmap');
      assert.ok(pop > 60000, game + '/' + st + ': covers almost every Trainer ID, got ' + pop);
      if (src.crosscheck) assert.equal(src.crosscheck.differ_more, 0,
        game + '/' + st + ': no disagreement with the shipped bracket table bigger than a few RNG steps');
    }
    // the two states must actually be different tables, or one of them is a copy and the picker is a lie
    let differing = 0, compared = 0;
    for (let t = 0; t < 65536; t += 97) {
      const a = M.routeFor(D, t, game, 'gbp', 'days0');
      const b = M.routeFor(D, t, game, 'gbp', 'days512');
      if (!a || !b) continue;
      compared++;
      if (a.lid !== b.lid || a.waitFrames !== b.waitFrames || a.plateauIndex !== b.plateauIndex) differing++;
    }
    assert.ok(compared > 300, game + ': compared enough Trainer IDs across states, got ' + compared);
    assert.ok(differing > 0.9 * compared,
      game + ': days0 and days512 should give different routes for nearly every Trainer ID, got ' + differing + '/' + compared);
    assert.equal(M.routeFor(D, 0x1234, game, 'gbp', 'days0').rtcState, 'days0', game + ': the route reports its state');
  }
});
