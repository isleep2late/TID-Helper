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

test('the checkable ALTERNATES agree with the validated single-press table', () => {
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
  // TIGHTENED 2026-09-20, which is what this assertion was pinned for. It used to require that EVERY
  // checkable alternate disagree, because every one did, and said that if any ever agreed the
  // alternates had been regenerated and this should expect agreement. The cause turned out not to
  // need a harness re-run at all: make_psr2.py emitted the alternate stream in defaultdict insertion
  // order while the reader indexes it by a prefix sum over counts in Trainer-ID order, so every
  // record was a real route carrying the right Lucky ID, filed under the wrong Trainer ID. Sorting
  // the emission fixed all four, and four independent harness boots confirmed the corrected Trainer
  // IDs (26780, 27081, 28021, 28144 for Lucky ID 01001).
  assert.equal(disagree.length, 0,
    disagree.length + ' of ' + rows.length + ' checkable alternates disagree with the validated single-press table: ' +
    JSON.stringify(disagree.slice(0, 4)));
  // The sharpest case of the old bug: an alternate claimed a single-press-equivalent route to
  // Trainer ID 0, which the single-press table never produces. It must stay gone.
  const o0 = oracle('crystal');
  assert.equal(o0.tids.indexOf(0), -1, 'Trainer ID 0 does not occur in the single-press table');
  assert.ok(!rows.some((x) => x.tid === 0), 'no alternate may claim a single-press-equivalent route to Trainer ID 0');
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
  // Gold and Silver ship alternates too, as of 2026-09-20 - capped at 2 per Trainer ID rather than
  // Crystal's 4, because those sweeps are per-day-bracket and the file is already 6.9 MB. They are
  // built from the days0 sweep ONLY, so a days512 boot must be offered none: those two games pick a
  // table by the cartridge-clock day bracket, and a days0 alternate handed to a days512 player is a
  // script that cannot produce what it promises.
  const maxOf = (u8) => { let mx = 0; for (let i = 0; i < u8.length; i++) if (u8[i] > mx) mx = u8[i]; return mx; };
  for (const g of ['gold', 'silver']) {
    const ga = P.altTables(P.meth(D, g), 'days0');
    assert.ok(ga && ga.pairs > 0, g + ' ships an alternate table on days0');
    assert.ok(maxOf(ga.cnt) <= 2, g + ' keeps at most 2 alternates per Trainer ID, got ' + maxOf(ga.cnt));
    assert.equal(P.altTables(P.meth(D, g), 'days512'), null, g + ' offers no days0 alternate to a days512 boot');
  }
  // Crystal has no clock brackets, so its state is always days0 - but the gate is stated once for
  // every game, and an unexpected state must not fall through to the days0 table.
  assert.equal(P.altTables(P.meth(D, 'crystal'), 'days512'), null, 'the gate is not gold/silver-specific');
});

// ---------------------------------------------------------------------------
// Searching by Lucky ID (added 2026-09-20, after a report that the standard
// LID 01001 manip could not be found).
//
// Lucky ID 01001 is Kenya's fixed OT ID, so matching it makes the Radio Tower
// lottery pay the Master Ball. The manip is NAMED after the Lucky ID; the
// Trainer ID that comes with it is incidental. These four routes were each run
// on the gambatte-core harness against the untouched Crystal ROM and the CGB
// boot ROM, and each produced Lucky ID 03E9 with the Trainer ID pinned here -
// so this is a hardware-equivalent expectation, not a restatement of the table.
// ---------------------------------------------------------------------------
const HARNESS_LID_01001 = [
  // tid,   hold plateau lo-hi, pre, opt, post, W   (gen2tid psr ... crystal gbp)
  { tid: 0x689C, pre: 1, opt: false, post: 0, waitFrames: 2028 },
  { tid: 0x69C9, pre: 0, opt: true,  post: 0, waitFrames: 4396 },
  { tid: 0x6DF0, pre: 2, opt: false, post: 0, waitFrames: 5276 },
  { tid: 0x6D75, pre: 2, opt: false, post: 2, waitFrames: 3700 },
];

test('lidSearch finds the Lucky ID 01001 routes the harness confirmed', () => {
  const hits = P.lidSearch(D, 0x03E9, 'crystal', 'gbp', 'days0');
  assert.equal(hits.length, HARNESS_LID_01001.length,
    'expected ' + HARNESS_LID_01001.length + ' Crystal routes to Lucky ID 01001, got ' + hits.length);
  for (const want of HARNESS_LID_01001) {
    const got = hits.find((h) => h.tid === want.tid);
    assert.ok(got, 'no route found for Trainer ID ' + want.tid + ' ($' + want.tid.toString(16).toUpperCase() + ')');
    assert.equal(got.route.lid, 0x03E9, 'Trainer ID ' + want.tid + ' route does not carry Lucky ID 01001');
    assert.equal(got.route.pre, want.pre, 'pre-backouts for ' + want.tid);
    assert.equal(got.route.opt, want.opt, 'OPTION step for ' + want.tid);
    assert.equal(got.route.post, want.post, 'post-backouts for ' + want.tid);
    assert.equal(got.route.waitFrames, want.waitFrames, 'wait for ' + want.tid);
  }
});

// Gold and Silver reach Lucky ID 01001 too, at their own Trainer IDs - the manip is named after the
// Lucky ID, and which Trainer ID comes with it is incidental and differs per game. Both routes below
// were run on the gambatte-core harness against the untouched ROMs and the CGB boot ROM:
//   gen2tid psr pokegold.gbc   cgb_boot.bin gold   gbp 2217 2 5432 0 2 -> W=5432,6EBD,03E9,0000
//   gen2tid psr pokesilver.gbc cgb_boot.bin silver gbp  716 1 5708 1 2 -> W=5708,6F89,03E9,0000
// Before 2026-09-20 neither game shipped alternates, so neither could answer for Lucky ID 01001 at
// all - the page offered a Lucky ID box on Crystal only.
const HARNESS_GS_LID_01001 = [
  { game: 'gold',   tid: 0x6EBD, holdFrom: 2217, pre: 2, opt: false, post: 2, waitFrames: 5432 },
  { game: 'silver', tid: 0x6F89, holdFrom:  716, pre: 1, opt: true,  post: 2, waitFrames: 5708 },
];

test('Gold and Silver reach Lucky ID 01001 at the Trainer IDs the harness confirmed', () => {
  for (const want of HARNESS_GS_LID_01001) {
    const hits = P.lidSearch(D, 0x03E9, want.game, 'gbp', 'days0');
    assert.ok(hits.length >= 1, want.game + ' finds no route to Lucky ID 01001');
    const got = hits.find((h) => h.tid === want.tid);
    assert.ok(got, want.game + ' has no route at Trainer ID ' + want.tid + ' ($' + want.tid.toString(16).toUpperCase() + ')');
    assert.equal(got.route.lid, 0x03E9, want.game + ' route does not carry Lucky ID 01001');
    assert.equal(got.route.plateau.derived_at_hold_frame, want.holdFrom, 'hold frame for ' + want.game);
    assert.equal(got.route.pre, want.pre, 'pre-backouts for ' + want.game);
    assert.equal(got.route.opt, want.opt, 'OPTION step for ' + want.game);
    assert.equal(got.route.post, want.post, 'post-backouts for ' + want.game);
    assert.equal(got.route.waitFrames, want.waitFrames, 'wait for ' + want.game);
  }
});

test('a days512 Gold player is offered no Lucky ID route built from the days0 sweep', () => {
  // The whole reason the alternates are gated: these routes exist only in the days0 sweep, and Gold
  // and Silver pick their table by the cartridge-clock day bracket. Answering a days512 player with
  // a days0 script would be worse than answering nothing.
  for (const g of ['gold', 'silver']) {
    const hits = P.lidSearch(D, 0x03E9, g, 'gbp', 'days512');
    assert.ok(hits.every((h) => !h.fromAlternate), g + '/days512 must not serve a days0 alternate');
  }
});

test('lidSearch returns the easiest route first', () => {
  const hits = P.lidSearch(D, 0x03E9, 'crystal', 'gbp', 'days0');
  const cost = (h) => h.route.pre + (h.route.opt ? 1 : 0) + h.route.post;
  for (let i = 1; i < hits.length; i++) {
    const a = cost(hits[i - 1]), b = cost(hits[i]);
    assert.ok(a < b || (a === b && hits[i - 1].route.waitFrames <= hits[i].route.waitFrames),
      'row ' + i + ' is not in easiest-first order');
  }
  assert.equal(hits[0].tid, 0x689C, 'the easiest route to Lucky ID 01001 is the one to Trainer ID 26780');
});

test('a Lucky ID nothing reaches returns nothing rather than throwing', () => {
  // 0xFFFF is a real Lucky ID, but no Crystal route in this sweep produces it.
  const hits = P.lidSearch(D, 0xFFFF, 'crystal', 'gbp', 'days0');
  assert.ok(Array.isArray(hits), 'returns an array');
  for (const h of hits) assert.equal(h.route.lid, 0xFFFF, 'every returned route really carries the asked-for Lucky ID');
});

test('lidSearch rejects a Lucky ID outside 0..65535', () => {
  assert.throws(() => P.lidSearch(D, -1, 'crystal', 'gbp', 'days0'), /0\.\.65535/);
  assert.throws(() => P.lidSearch(D, 70000, 'crystal', 'gbp', 'days0'), /0\.\.65535/);
});

test('knownTargets names the published manip, by Lucky ID and by its published Trainer ID', () => {
  const byLid = P.knownTargets(D, null, 0x03E9, 'crystal');
  assert.equal(byLid.length, 1, 'Lucky ID 01001 matches exactly one published target');
  assert.equal(byLid[0].id, 'glitchless-lid-01001');
  assert.ok(byLid[0].appliesHere, 'the target lists crystal among its games');
  assert.match(byLid[0].set.name, /Kenya/, 'the target explains what the Lucky ID is');

  // 28489 is the Trainer ID published ALONGSIDE that Lucky ID. Someone typing it is
  // asking about this manip, and saying nothing is how 28489 came to be mistaken for it.
  const byPublishedTid = P.knownTargets(D, 0x6F49, null, 'gold');
  assert.equal(byPublishedTid.length, 1, 'the published pair Trainer ID matches the target');
  assert.equal(byPublishedTid[0].id, 'glitchless-lid-01001');

  assert.equal(P.knownTargets(D, 0x1234, 0x5678, 'crystal').length, 0, 'an unremarkable pair matches nothing');
});
