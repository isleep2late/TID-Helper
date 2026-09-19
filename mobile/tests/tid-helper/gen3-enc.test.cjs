// gen3-enc.test.cjs - Ruby/Sapphire wild-encounter mode (gen3-enc.json, page-gen3-enc.js).
//   1. only the family that can actually be aimed is offered, and the others carry a stated reason
//   2. every encounter slot resolves to a species record carrying the fields the generator reads
//   3. what the generator returns is actually on that map, at a level that map can produce
//   4. the dead-battery seed is the one the citation derives, not a number someone typed
//   5. prior work is credited, and the limits are stated rather than implied
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
