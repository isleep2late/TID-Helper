// gen2-coverage.test.cjs - page-gen2.js's reachability figure. Run: node --test tests/tid-helper/gen2-coverage.test.cjs
//   1. the figure the page prints is SCOPED to the one (platform, RTC state) table it is aiming into: at most
//      BIN_COUNT distinct Trainer IDs, and exactly the distinct TIDs of that table's own bins. The figure used to be
//      inversion.games[game].ambiguity.all_distinct_tables, the union over every distinct table of the game, printed
//      inside a sentence that named one platform and one RTC state (Gold: 23,739 / 36.2% against a table of 595 /
//      0.9%), so the tests below assert the bound the union cannot satisfy;
//   2. the union is still reported, labelled as a union, and still equals the data's precomputed block;
//   3. the engine recomputes the data's own all_distinct_tables exactly, so the scoped count is the same arithmetic
//      over fewer tables;
//   4. NEGATIVE CONTROL: a TID that lives in another RTC state of the same platform is counted by the union and is
//      NOT found by the typed-ID lookup the figure sits next to, which is what made the union figure misleading.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines(), P = H.page('page-gen2.js');
const G1 = E.G1, G2 = E.G2;
const GAMES = ['gold', 'silver', 'crystal'];

// every (platform key, RTC state) the Gen 2 page can be put into
function scopes(game) {
  const out = [];
  for (const pk of D.gen2.games[game].platform_keys) for (const st of G2.stateIds(D.gen2, game)) out.push([pk, st]);
  return out;
}

test('the printed figure is the selected table, not the union over all tables', () => {
  for (const game of GAMES) {
    const all = D.gen2.inversion.games[game].ambiguity.all_distinct_tables;
    for (const [pk, st] of scopes(game)) {
      const cov = P.coverage(D, G2, game, pk, st);
      // one table is BIN_COUNT bins, so it cannot carry more than BIN_COUNT distinct Trainer IDs.
      // The union figure (Gold 23,739) breaks this by two orders of magnitude.
      assert.equal(cov.tables, 1, game + '/' + pk + '/' + st + ': one table in scope');
      assert.equal(cov.entries, G2.BIN_COUNT, 'the table is ' + G2.BIN_COUNT + ' bins');
      assert.ok(cov.tids <= G2.BIN_COUNT, game + '/' + pk + '/' + st + ': ' + cov.tids + ' distinct TIDs in one table of ' + G2.BIN_COUNT + ' bins');
      // and it is exactly the distinct TIDs of that table's own bins
      const own = new Set(G2.entries(D.gen2, game, pk, st).map((e) => e.tid));
      assert.equal(cov.tids, own.size, game + '/' + pk + '/' + st + ': the count is this table\'s distinct TIDs');
      assert.ok(Math.abs(cov.pct - (own.size / 65536) * 100) < 1e-12, 'the percentage is that count over 65,536');
      // the union is still reported, and is still the data's own block
      assert.equal(cov.allTids, all.distinct_tids, game + ': the union figure is the data\'s all_distinct_tables');
      assert.equal(cov.allTables, all.tables);
      assert.ok(Math.abs(cov.allPct - (all.distinct_tids / 65536) * 100) < 1e-12);
    }
  }
});

test('Gold and Silver: the scoped figure is far below the union it used to print', () => {
  for (const game of ['gold', 'silver']) {
    const all = D.gen2.inversion.games[game].ambiguity.all_distinct_tables;
    for (const [pk, st] of scopes(game)) {
      const cov = P.coverage(D, G2, game, pk, st);
      assert.notEqual(cov.tids, all.distinct_tids, game + '/' + pk + '/' + st + ': the headline must not be the union');
      assert.ok(cov.tids * 20 < all.distinct_tids, game + '/' + pk + '/' + st + ': scoped ' + cov.tids + ' vs union ' + all.distinct_tids);
      assert.ok(cov.pct < 1, 'one table is under 1% of the ID space, printed as ' + cov.pct.toFixed(1) + '%');
    }
  }
  // Crystal is two tables, so the two figures are closer, but they are still different numbers
  const cov = P.coverage(D, G2, 'crystal', 'gbp', 'days0');
  assert.notEqual(cov.tids, cov.allTids, 'crystal: 1 table of 2');
});

test('the engine reproduces the data\'s precomputed all_distinct_tables, so the scoped count is the same arithmetic', () => {
  for (const game of GAMES) {
    const a = G2.ambiguity(D.gen2, game, {}), d = D.gen2.inversion.games[game].ambiguity.all_distinct_tables;
    assert.equal(a.tables, d.tables, game + ' tables');
    assert.equal(a.entries, d.entries, game + ' entries');
    assert.equal(a.distinctTids, d.distinct_tids, game + ' distinct TIDs');
  }
});

test('NEGATIVE CONTROL: a TID counted by the union is not found by the lookup the figure sits next to', () => {
  const game = 'gold', pk = 'gbp', here = 'days0';
  const mine = new Set(G2.entries(D.gen2, game, pk, here).map((e) => e.tid));
  let elsewhere = null, fromState = null;
  for (const st of G2.stateIds(D.gen2, game)) {
    if (st === here) continue;
    const hit = G2.entries(D.gen2, game, pk, st).map((e) => e.tid).find((t) => !mine.has(t));
    if (hit != null) { elsewhere = hit; fromState = st; break; }
  }
  assert.ok(elsewhere != null, 'a TID of another RTC state that this table does not carry');
  const platformId = P.platformsFor(D, game).find((k) => D.gen2.platforms[k].platform_key === pk);
  const ctx = P.context(D, G1, G2, game, platformId, 'dmg', here);
  assert.equal(ctx.platformKey, pk);
  assert.equal(P.invertTyped(G2, D, ctx, elsewhere, null).length, 0,
    'TID ' + elsewhere + ' (carried by ' + fromState + ') is not reachable from ' + here + ', which is the table the page prints about');
  const cov = P.coverage(D, G2, game, pk, here);
  assert.ok(cov.tids < cov.allTids, 'yet the union counts it: scoped ' + cov.tids + ' vs union ' + cov.allTids);
});
