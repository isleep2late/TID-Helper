// gen3-enc.test.cjs - Ruby/Sapphire wild-encounter mode (gen3-enc.json, page-gen3-enc.js).
//   1. only the family that can actually be aimed is offered, and the others carry a stated reason
//   2. every encounter slot resolves to a species record carrying the fields the generator reads
//   3. what the generator returns is actually on that map, at a level that map can produce
//   4. the dead-battery seed is the one the citation derives, not a number someone typed
//   5. prior work is credited, and the limits are stated rather than implied
//   6. the calibration matcher: an encounter generated at a known advance is matched back to that advance
//   7. an under-specified report is reported as ambiguous rather than resolved to one advance
//   8. Rock Smash, whose odds roll makes most advances produce nothing, searches without throwing
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers.cjs');

const D = H.data();
const M = H.page('page-gen3-enc.js');
const d = M.data(D);

test('only Ruby and Sapphire are offered, and Emerald / FR-LG carry a reason rather than silence', () => {
  assert.deepEqual(Object.keys(d.games).sort(), ['ruby', 'sapphire']);
  for (const k of ['emerald', 'firered-leafgreen']) {
    const s = d.seed_model[k];
    assert.equal(s.offered, false, k + ' is not offered');
    assert.ok(s.why && s.why.length > 80, k + ' says why, at length');
  }
  // the FR/LG reason must name the title-screen reseed - the thing that makes it impossible, and the
  // thing an earlier version of this model got wrong
  assert.match(d.seed_model['firered-leafgreen'].why, /title_screen\.c:735/);
  assert.match(d.seed_model['firered-leafgreen'].why, /TM1CNT_L/);
  // and Emerald's must name the advance-count problem, not claim it is impossible
  assert.match(d.seed_model.emerald.why, /advance count is NOT the frame count|10,093/);
  assert.throws(() => M.gameOf(D, 'emerald'), /only Ruby and Sapphire/);
});

test('every encounter slot in every map resolves to a species record with the fields the generator reads', () => {
  const NEEDED = ['dex', 'gender_ratio', 'ability_ids', 'type_ids', 'base_stats'];
  let slots = 0, maps = 0;
  for (const game of Object.keys(d.games)) {
    for (const m of d.games[game].maps) {
      maps++;
      for (const kind of M.ENC_KINDS) {
        const s = M.slotsOf(D, m, kind.id);
        if (!s) continue;
        for (const x of s) {
          slots++;
          for (const f of NEEDED) assert.ok(f in x.species, game + '/' + m.name + '/' + kind.id + ': species ' + x.species.dex + ' lacks ' + f);
          assert.ok(x.minLevel >= 1 && x.maxLevel >= x.minLevel && x.maxLevel <= 100, 'sane levels');
        }
      }
    }
  }
  assert.equal(maps, 194, 'both games carry all their maps');
  assert.ok(slots > 2000, 'checked every slot, got ' + slots);
  assert.equal(Object.keys(d.species).length, d.species_count);
});

test('a generated encounter is on that map, at a level that map can produce', () => {
  let checked = 0;
  for (const game of Object.keys(d.games)) {
    for (const m of M.mapsWith(D, game, 'land').slice(0, 12)) {
      const slots = M.slotsOf(D, m, 'land');
      const allowed = new Set(slots.map((s) => s.species.dex));
      const lo = Math.min(...slots.map((s) => s.minLevel)), hi = Math.max(...slots.map((s) => s.maxLevel));
      for (const r of M.encountersAt(D, game, m, 'land', 0, 25)) {
        checked++;
        assert.ok(allowed.has(r.species), game + '/' + m.name + ': generated dex ' + r.species + ' is not a slot on this map');
        assert.ok(r.level >= lo && r.level <= hi, game + '/' + m.name + ': level ' + r.level + ' outside ' + lo + '-' + hi);
        assert.ok(r.ivArray.length === 6 && r.ivArray.every((v) => v >= 0 && v <= 31), 'IVs in range');
        assert.ok(r.nature >= 0 && r.nature < 25 && r.natureName);
      }
    }
  }
  assert.ok(checked > 500, 'checked enough generated encounters, got ' + checked);
});

test('the dead-battery seed is what the citation derives, and the same table comes back every time', () => {
  // dummy clock = 2000-01-01, day 1 -> 1440 minutes; fold(1440) = (1440>>16) ^ (1440 & 0xFFFF) = 1440
  const mc = 1440;
  assert.equal(M.deadBatterySeed(D), ((mc >>> 16) ^ (mc & 0xFFFF)) >>> 0);
  assert.equal(M.deadBatterySeed(D), 0x5A0);
  assert.equal(d.seed_model['ruby-sapphire'].reseeded_on_continue, false);
  assert.ok(d.seed_model['ruby-sapphire'].citations.some((c) => /main\.c:115/.test(c)), 'cites the boot seed call');
  assert.ok(d.seed_model['ruby-sapphire'].citations.some((c) => /no SeedRngAndSetTrainerId and no TM1CNT/.test(c)),
    'cites the check that R/S does NOT do what FireRed does');
  // determinism: same inputs, same rows
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  const a = M.encountersAt(D, 'ruby', m, 'land', 0, 10).map((r) => r.pid);
  const b = M.encountersAt(D, 'ruby', m, 'land', 0, 10).map((r) => r.pid);
  assert.deepEqual(a, b);
});

test('prior work is credited and the missing piece is stated, not implied', () => {
  assert.ok(d.credits.length >= 5, 'five credits at least');
  for (const c of d.credits) for (const k of ['who', 'role', 'what']) assert.ok(c[k] && c[k].length, 'credit has ' + k);
  const who = d.credits.map((c) => c.who).join(' | ');
  for (const name of ['pret', 'PokeFinder', 'PKHeX', 'ConstructiveCynicism', 'CasualPokePlayer']) {
    assert.ok(who.includes(name), 'credits name ' + name + ': ' + who);
  }
  assert.match(d.credit_note, /None of them endorse/);
  // the first not_derived entry is the advance count, and it must not be softened away
  assert.match(d.not_derived[0], /ADVANCE COUNT/);
  assert.match(d.not_derived[0], /Only an emulator can produce it/);
  assert.ok(d.not_derived.some((x) => /has been run on hardware/.test(x)), 'says nothing is hardware-tested');
});

test('an advance that produces no encounter renders as such instead of throwing', () => {
  // gen3Wild legitimately returns {valid:false, reason} when a pre-roll fails - Rock Smash rolls its odds
  // before anything else. Assuming every row is a Pokemon threw "Cannot read properties of undefined
  // (reading 'join')" and replaced the whole mode with an error, with no way back.
  const m = M.mapsWith(D, 'ruby', 'rock_smash')[0];
  assert.ok(m, 'ruby has rock smash maps');
  const rows = M.encountersAt(D, 'ruby', m, 'rock_smash', 0, 40);
  assert.equal(rows.length, 40);
  const invalid = rows.filter((r) => !r || r.valid === false || !r.ivArray);
  assert.ok(invalid.length > 0, 'rock smash really does produce no-encounter advances');
  for (const r of invalid) assert.ok(r.reason, 'an invalid row says why');
  // every encounter type must be renderable without throwing
  for (const kind of M.ENC_KINDS) {
    const mm = M.mapsWith(D, 'ruby', kind.id)[0];
    if (!mm) continue;
    for (const r of M.encountersAt(D, 'ruby', mm, kind.id, 0, 10)) {
      if (r && r.valid !== false && r.ivArray) {
        assert.equal(r.ivArray.length, 6, kind.id + ': a valid row has six IVs');
        assert.ok(r.natureName && r.level > 0, kind.id + ': a valid row is complete');
      }
    }
  }
});

test('an encounter generated at a known advance is matched back to that advance', () => {
  // the loop the page prescribes, in one direction: the runner saw this Pokemon, so which advances produce it?
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  const rows = M.encountersAt(D, 'ruby', m, 'land', 0, 400);
  let checked = 0;
  for (const at of [0, 17, 137, 399]) {
    const r = rows[at];
    assert.ok(r && r.valid !== false, 'land advance ' + at + ' produces an encounter');
    assert.equal(r.frame, at, 'a row knows its own advance');
    const hits = M.matchesFor(D, 'ruby', m, 'land', { species: r.species, level: r.level, nature: r.nature }, 0, 400);
    assert.ok(hits.some((h) => h.frame === at), 'advance ' + at + ' is among its own matches');
    for (const h of hits) {
      checked++;
      assert.equal(h.species, r.species);
      assert.equal(h.level, r.level);
      assert.equal(h.nature, r.nature);
      assert.equal(h.ivArray.length, 6, 'a match is a whole encounter, not a {valid:false} row');
    }
  }
  assert.ok(checked >= 4, 'matched something, got ' + checked);
  // and a report from another map does not silently match here: species that is not in this map's slots
  const elsewhere = M.mapsWith(D, 'ruby', 'land').map((x) => M.slotsOf(D, x, 'land').map((s) => s.species.dex));
  const here = new Set(elsewhere[0]);
  const foreign = elsewhere.flat().find((dex) => !here.has(dex));
  assert.equal(M.matchesFor(D, 'ruby', m, 'land', { species: foreign, level: null, nature: null }, 0, 400).length, 0,
    'a species this map cannot produce matches no advance');
});

test('a report that does not pin one advance comes back as several, not as one', () => {
  // species alone is the case that matters: the runner can always name it, and often nothing else. The page
  // must show every candidate rather than choosing, so this asserts the ambiguity is real and preserved.
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  const first = M.encountersAt(D, 'ruby', m, 'land', 0, 1)[0];
  const loose = M.matchesFor(D, 'ruby', m, 'land', { species: first.species, level: null, nature: null }, 0, 400);
  assert.ok(loose.length > 1, 'species alone leaves several advances, got ' + loose.length);
  assert.ok(loose.some((h) => h.frame === 0), 'the true advance is among them');
  // every extra fact can only narrow it, never widen it, and the true advance survives each narrowing
  const withLevel = M.matchesFor(D, 'ruby', m, 'land', { species: first.species, level: first.level, nature: null }, 0, 400);
  const withBoth = M.matchesFor(D, 'ruby', m, 'land', { species: first.species, level: first.level, nature: first.nature }, 0, 400);
  assert.ok(withLevel.length <= loose.length && withBoth.length <= withLevel.length, 'each field narrows');
  for (const set of [withLevel, withBoth]) assert.ok(set.some((h) => h.frame === 0), 'the true advance survives narrowing');
  // the IVs are what the page offers as the tie-breaker, so they must actually differ between candidates
  const ivs = new Set(withBoth.map((h) => h.ivArray.join('/')));
  assert.equal(ivs.size, withBoth.length, 'the candidates are separable by IVs');
});

test('a Rock Smash search does not throw, and the odds roll comes from the map', () => {
  // gen3Wild rolls the Rock Smash odds before anything else and reports a failure as {valid:false, reason}.
  // A search must skip those rather than return them as matches with no species on them (1713d078 was the
  // crash from the same assumption), and it must pass the map's own rate: with no rate the threshold is
  // Random() % 2880 >= 0, so every single advance fails and the kind can never be calibrated at all.
  for (const game of ['ruby', 'sapphire']) {
    for (const m of M.mapsWith(D, game, 'rock_smash')) {
      assert.equal(M.rateOf(m, 'rock_smash'), m.rock_smash.rate, 'the rate is the map record\'s own');
      const rows = M.encountersAt(D, game, m, 'rock_smash', 0, 300);
      const valid = rows.filter((r) => r.valid !== false);
      assert.ok(valid.length > 0, game + '/' + m.name + ': some advance produces a Rock Smash encounter');
      assert.ok(valid.length < rows.length, game + '/' + m.name + ': the odds roll still refuses most of them');
      // an empty report: every field blank must not return the advances that generated nothing
      const all = M.matchesFor(D, game, m, 'rock_smash', { species: null, level: null, nature: null }, 0, 300);
      assert.equal(all.length, valid.length, 'only advances with an encounter are matches');
      for (const r of all) assert.equal(r.ivArray.length, 6);
      const r0 = valid[0];
      const hits = M.matchesFor(D, game, m, 'rock_smash', { species: r0.species, level: r0.level, nature: r0.nature }, 0, 300);
      assert.ok(hits.some((h) => h.frame === r0.frame), 'a Rock Smash encounter matches back to its advance');
    }
  }
  // and every other kind searches without throwing either
  for (const kind of M.ENC_KINDS) {
    const m = M.mapsWith(D, 'ruby', kind.id)[0];
    if (!m) continue;
    assert.doesNotThrow(() => M.matchesFor(D, 'ruby', m, kind.id, { species: null, level: null, nature: null }, 0, 120), kind.id);
  }
});
