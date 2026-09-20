// gen2-psr-reverse.test.cjs - the reverse table: the thing that turns "I got 42172" into "you were 24 frames late".
//
// WHY EACH OF THESE EXISTS. All three failures below happened for real while building this table on 2026-09-20:
//
//  1. BIT ORDER. make_psr2.py writes the coverage bitmap LSB-first (`bm[t >> 3] |= 1 << (t & 7)`). A reader that
//     uses 7 - (t & 7) mirrors every Trainer ID onto a neighbour inside the same byte. With 99.97% coverage that
//     is almost invisible - only the 20 uncovered IDs read wrong - so it survives casual testing and hands one
//     runner a route belonging to a different ID. It cost a full rebuild here. Pinned with a negative control.
//  2. FFFF IS A REAL TRAINER ID. 14 cells in the Crystal sweep roll 65535. Using FFFF as a "no roll" sentinel
//     would tell those 14 runners their wait produced nothing. The empty cells ship as an explicit index list.
//  3. THE ROUND TRIP. If the forward and reverse tables disagree, every diagnosis is confidently wrong, which is
//     worse than the "no table" message it replaced.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers.cjs');

const D = H.data();
const M = H.page('page-gen2-psr.js');

function psr(game) { return D.gen2psr.games[game].gbp; }
const WITH_REVERSE = Object.keys(D.gen2psr.games).filter((g) => psr(g).reverse);

test('the coverage bitmap is read LSB-first, the order make_psr2.py writes it', () => {
  for (const game of Object.keys(D.gen2psr.games)) {
    const m = psr(game);
    const bm = Buffer.from(m.covered_bitmap_b64, 'base64');
    const lsb = (t) => (bm[t >> 3] >> (t & 7)) & 1;
    const msb = (t) => (bm[t >> 3] >> (7 - (t & 7))) & 1;
    const uncovered = [];
    for (let t = 0; t <= 0xffff && uncovered.length < 40; t++) if (!lsb(t)) uncovered.push(t);
    assert.ok(uncovered.length, game + ': every Trainer ID is covered, so this test proves nothing - pick another guard');
    // what the page actually does must agree with the LSB reading, for every uncovered ID
    for (const t of uncovered) {
      assert.equal(M.routeFor(D, t, game), null,
        game + ': Trainer ID ' + t + ' is not covered but routeFor handed out a route - the bitmap is being read backwards');
    }
    // NEGATIVE CONTROL: the two readings must actually disagree somewhere, or the assertion above is vacuous
    // and would still pass with the bug reintroduced.
    let differs = 0;
    for (let t = 0; t <= 0xffff; t++) if (lsb(t) !== msb(t)) differs++;
    assert.ok(differs > 0, game + ': LSB and MSB readings agree everywhere, so this test cannot catch a flip');
  }
});

test('reverse table: shape, and FFFF is a Trainer ID rather than a sentinel', () => {
  assert.ok(WITH_REVERSE.length >= 1, 'at least one game ships a reverse table');
  for (const game of WITH_REVERSE) {
    const m = M.meth(D, game), rv = psr(game).reverse;
    const per = Math.floor(rv.wait_max / rv.wait_step) + 1;
    const raw = Buffer.from(rv.tids_b64, 'base64');
    assert.equal(raw.length, rv.families.length * per * 2, game + ': reverse table is the wrong size');
    assert.equal(rv.wait_step, psr(game).poll_period_frames, game + ': reverse steps by something other than the poll period');
    assert.ok(Array.isArray(rv.no_roll_idx), game + ': empty cells must be an explicit list, not a reserved value');
    assert.equal(rv.no_roll_idx.length, rv.no_roll_cells, game + ': no_roll_idx length disagrees with no_roll_cells');

    const rev = M.reverseTable(m);
    const empty = new Set(rv.no_roll_idx);
    // every cell holding FFFF that is NOT in the empty list must read back as Trainer ID 65535, not as "nothing"
    let realFFFF = 0;
    for (let i = 0; i < raw.length / 2; i++) {
      if (((raw[i * 2] << 8) | raw[i * 2 + 1]) !== 0xffff) continue;
      const fi = Math.floor(i / per), wi = i % per;
      if (empty.has(i)) assert.equal(M.revTidAt(rev, fi, wi), -1, game + ': empty cell ' + i + ' did not read as empty');
      else { assert.equal(M.revTidAt(rev, fi, wi), 0xffff, game + ': cell ' + i + ' rolls 65535 and must read as 65535'); realFFFF++; }
    }
    assert.ok(realFFFF > 0, game + ': no cell genuinely rolls FFFF, so the sentinel trap cannot be demonstrated here');
  }
});

test('forward and reverse agree: every covered route lands on its own Trainer ID', () => {
  for (const game of WITH_REVERSE) {
    const m = M.meth(D, game), rv = psr(game).reverse;
    const rev = M.reverseTable(m);
    const pos = new Map(rv.families.map((f, i) => [f, i]));
    let checked = 0;
    for (let t = 0; t <= 0xffff; t++) {
      const r = M.routeFor(D, t, game);
      if (!r) continue;
      const fam = M.famKey(r), fi = pos.get(fam);
      assert.notEqual(fi, undefined, game + ': covered Trainer ID ' + t + ' uses family ' + fam + ', absent from the reverse table');
      assert.equal(M.revTidAt(rev, fi, r.waitFrames / rv.wait_step), t,
        game + ': forward says Trainer ID ' + t + ' but the reverse table disagrees at that cell');
      checked++;
    }
    assert.ok(checked > 60000, game + ': only round-tripped ' + checked + ' Trainer IDs');
  }
});

test('diagnose reads a real miss: 42172 on the Crystal 28489 route is 24 frames late, not a wrong hold', () => {
  const m = M.meth(D, 'crystal');
  const r = M.routeFor(D, 28489, 'crystal');
  assert.ok(r, 'the 28489 route must be covered');
  const d = M.diagnose(m, r, 42172);
  assert.equal(d.kind, 'wait', 'the owner got 42172 twice on this route; it is a timing miss, not a wrong hold window');
  assert.equal(d.errorFrames, 24, '42172 sits 24 frames past the prescribed wait');
  // and a Trainer ID from a different script must NOT be reported as a timing error
  const other = M.diagnose(m, r, 10065);
  assert.notEqual(other.kind, 'wait', '10065 is not produced by this route at any wait and must not read as mistiming');
  assert.equal(M.diagnose(m, r, 28489).kind, 'target');
});
