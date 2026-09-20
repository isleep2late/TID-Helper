// gen2-psr-pairs.test.cjs - the alternate (Trainer ID, Lucky ID) routes carry less evidence than the primaries,
// and the page says so.
//
// WHAT WAS FOUND. gen2-psr.json's own validation is a cross-check of the PRIMARY table against the shipped
// single-press table over the bins where the two methods overlap: 599 compared, 599 identical. The alternates -
// 255,694 records on Crystal, kept so an exact Lucky ID can be asked for - are not in that cross-check.
//
// Running the same comparison over the alternates is possible for a small subset: an alternate whose route is
// plateau 0 with no backouts and no OPTION step IS the single-press method, so the single-press table already
// says what wait produces what Trainer ID. Four such alternates fall inside the single-press table's range, and
// all four contradict it - the first claims a route to Trainer ID 0, which does not occur anywhere in the
// single-press table's 599 bins. Every degenerate PRIMARY checked the same way agrees.
//
// That is not proof the alternates are wrong; only the sweep harness can settle it, and it is not in this
// repository. It is enough that a route taken from them must not be presented as carrying the primary table's
// evidence. These tests pin the discrepancy so it cannot be quietly forgotten, and pin the warning.
// Run: node --test tests/tid-helper/gen2-psr-pairs.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines();
const P = H.page('page-gen2-psr.js'), G2 = E.G2;

// the single-press table as an oracle: offset -> Trainer ID, for the game whose psr plateau 0 IS that method
function oracle(game) {
  const t = G2.tableFor(D.gen2, game, 'gbp', 'days0');
  const tids = t.table.tids, rule = t.rule;
  return {
    tids,
    at(offset) {
      let b;
      try { b = G2.binOf(offset, rule); } catch (e) { return null; }
      return (b == null || b < 0 || b >= tids.length) ? null : tids[b];
    },
  };
}
const degenerate = (r) => r && r.plateauIndex === 0 && r.pre === 0 && !r.opt && r.post === 0;

test('psr plateau 0 really is the single-press method, so the oracle is sound', () => {
  const m = P.meth(D, 'crystal'), tim = D.gen2.methodologies['crystal/gbp/hold-start-v1'].timing;
  const p0 = m.plateaus[0];
  assert.equal(p0.hold_lo_frame, tim.hold_lo_frame, 'same hold window start');
  assert.equal(p0.hold_hi_frame, tim.hold_hi_frame, 'same hold window end');
  assert.equal(p0.menu_frame, tim.menu_frame, 'and the same menu frame, so a wait from one is a wait from the other');
});

test('every checkable degenerate PRIMARY agrees with the single-press table', () => {
  const o = oracle('crystal');
  let checked = 0, agree = 0;
  for (let tid = 0; tid <= 0xFFFF; tid++) {
    let r;
    try { r = P.routeFor(D, tid, 'crystal', 'gbp', 'days0'); } catch (e) { continue; }
    if (!degenerate(r)) continue;
    const off = r.waitFrames - 1;
    if (off < 2 || off > G2.OFFSET_MAX) continue;
    const said = o.at(off);
    if (said == null) continue;
    checked++;
    if (said === tid) agree++;
  }
  assert.ok(checked > 400, 'enough primaries to mean something: ' + checked);
  assert.equal(agree, checked, checked - agree + ' of ' + checked + ' degenerate primaries disagree with the validated single-press table');
});

test('the checkable ALTERNATES disagree - pinned, so a harness re-run can be seen to fix it', () => {
  const o = oracle('crystal');
  const m = P.meth(D, 'crystal'), a = P.altTables(m);
  assert.ok(a && a.pairs > 100000, 'Crystal ships the alternate table');
  const rows = [];
  for (let tid = 0; tid <= 0xFFFF; tid++) {
    for (let k = a.off[tid]; k < a.off[tid + 1]; k++) {
      const b = k * 5, lid = (a.st[b] << 8) | a.st[b + 1];
      let r;
      try { r = P.routeForPair(D, tid, lid, 'crystal'); } catch (e) { continue; }
      if (!r || !r.fromAlternate || !degenerate(r)) continue;
      const off = r.waitFrames - 1;
      if (off < 2 || off > G2.OFFSET_MAX) continue;
      const said = o.at(off);
      if (said == null) continue;
      rows.push({ tid, lid, W: r.waitFrames, said });
    }
  }
  assert.ok(rows.length >= 4, 'there are alternates the oracle can judge: ' + rows.length);
  const disagree = rows.filter((x) => x.said !== x.tid);
  // THIS IS THE FINDING. If a harness re-run ever fixes the alternates, this assertion fails and should be
  // changed to expect agreement - which is the point of pinning it.
  assert.equal(disagree.length, rows.length,
    'expected every checkable alternate to disagree (the known discrepancy); got ' + disagree.length + ' of ' + rows.length +
    ' - if some now agree, the alternates have been regenerated and this test should be tightened to expect agreement');
  // and the sharpest case: a Trainer ID the single-press table never produces at all
  const o0 = oracle('crystal');
  assert.equal(o0.tids.indexOf(0), -1, 'Trainer ID 0 does not occur in the single-press table');
  assert.ok(rows.some((x) => x.tid === 0), 'yet an alternate claims a single-press-equivalent route to it');
});

test('a route taken from the alternates is flagged, and the page says what that costs', () => {
  const m = P.meth(D, 'crystal'), a = P.altTables(m);
  // a primary is not flagged
  const prim = P.routeFor(D, 100, 'crystal', 'gbp', 'days0');
  const byPair = P.routeForPair(D, 100, prim.lid, 'crystal');
  assert.equal(byPair.fromAlternate, false, 'asking for the primary Lucky ID gives the primary, unflagged');
  // an alternate is
  const b = a.off[100] * 5, lid = (a.st[b] << 8) | a.st[b + 1];
  const alt = P.routeForPair(D, 100, lid, 'crystal');
  assert.ok(alt && alt.fromAlternate === true, 'an alternate Lucky ID gives a flagged route');
  assert.notEqual(alt.lid, prim.lid, 'and it really is a different Lucky ID');
  // Gold and Silver ship no alternates at all, so every pair route there is the validated primary
  for (const g of ['gold', 'silver']) {
    assert.equal(P.altTables(P.meth(D, g)), null, g + ' ships no alternate table');
  }
});
