// gen3-enc-guards.test.cjs - four things an adversarial read of the Ruby/Sapphire encounter mode turned up
// after its calibration panel was built. Each was a way for the page to say something untrue or to seize up:
//   1. the match list printed "All of them are listed" unconditionally, forty rows above a line saying how
//      many were not listed;
//   2. the search window had a min and no max, and the search runs synchronously inside render(), so a span
//      typed in as five million froze the page for the better part of ten seconds;
//   3. a stored attempt was validated on its advance number alone, so a malformed record - one arriving over
//      the prefs bridge, or left by an older version of the page - rendered "advance 9 on  (undefined) -
//      undefined Lv undefined" while the mode's summary line claimed an attempt was on record;
//   4. the reported species outlived the map and encounter type it was picked on, so the panel went on
//      searching for a species the new map has no slot for while the picker showed nothing selected.
// Run: node --test tests/tid-helper/gen3-enc-guards.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
const M = H.page('page-gen3-enc.js');
const D = H.data();
const mode = A.modes['gen3-enc'];

function reset() { A.prefs = { version: 1 }; }
function html(game) { const el = { innerHTML: '' }; mode.render(el, game || 'ruby'); return el.innerHTML; }
function typeInto(id, value) { return { type: 'input', target: { id: id, value: String(value) } }; }
function clickOn(selector, attrs) {
  const node = { getAttribute: (a) => (a in (attrs || {}) ? attrs[a] : null) };
  return { type: 'click', target: { closest: (sel) => (sel === selector ? node : null) } };
}
const landed = (game) => A.pref('gen3enc', 'landed.' + (game || 'ruby'));

test('the match list never claims to be complete while it is capped', () => {
  reset();
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  mode.onEvent(typeInto('g3e-map', m.map), 'ruby');
  // a species alone, over a wide window, matches far more advances than the table draws
  const slot = M.slotsOf(D, m, 'land')[0];
  mode.onEvent(typeInto('g3e-span', 4000), 'ruby');
  mode.onEvent(typeInto('g3e-got-species', slot.species.dex === undefined ? Object.keys(D.gen3enc.species).find((k) => D.gen3enc.species[k] === slot.species) : slot.species.dex), 'ruby');
  const wide = html();
  const hidden = /further candidates are not listed/.test(wide);
  if (hidden) {
    assert.ok(!/All of them are listed/.test(wide), 'a capped list must not say every candidate is shown');
    assert.match(wide, /The first \d+ are listed below/, 'it says how many it drew instead');
  }
  // and when everything does fit, it still says so
  mode.onEvent(typeInto('g3e-span', 40), 'ruby');
  const narrow = html();
  if (/advances between 0 and 39 generate/.test(narrow)) {
    assert.ok(!/further candidates are not listed/.test(narrow));
    assert.match(narrow, /All of them are listed/);
  }
});

test('the search window is bounded, and the page says the bound is its own and not the game\'s', () => {
  reset();
  mode.onEvent(typeInto('g3e-span', 5000000), 'ruby');
  const t0 = process.hrtime.bigint();
  const h = html();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 2000, 'a five-million span must not stall the render (took ' + Math.round(ms) + ' ms)');
  assert.match(h, /max="\d+"/, 'the field carries a max');
  assert.match(h, /The window stops at/, 'and the page says the ceiling is the page\'s, not a fact about the game');
  assert.doesNotMatch(h, /5,000,000|5000000/, 'the typed value is not echoed back as if it had been accepted');
  // a fractional or negative span does not escape the clamp either
  for (const bad of [-5, 0, 3.7, NaN]) {
    mode.onEvent(typeInto('g3e-span', bad), 'ruby');
    assert.doesNotThrow(() => html(), 'span ' + bad);
  }
});

test('a stored attempt is checked whole: a malformed record is ignored, not rendered', () => {
  const good = (() => {
    reset();
    const m = M.mapsWith(D, 'ruby', 'land')[0];
    mode.onEvent(typeInto('g3e-map', m.map), 'ruby');
    const r = M.encountersAt(D, 'ruby', m, 'land', 0, 200).find((x) => x && x.valid !== false);
    assert.equal(mode.onEvent(clickOn('[data-g3e-landed]', { 'data-g3e-landed': String(r.frame) }), 'ruby'), 'render');
    const L = landed();
    assert.ok(L && L.advance === r.frame, 'a real landing is recorded');
    assert.match(html(), /vs your attempt/, 'and the comparison column appears');
    return L;
  })();

  const broken = [
    { advance: 9 },                                     // the shape that rendered a row of undefineds
    Object.assign({}, good, { map: '' }),
    Object.assign({}, good, { kind: 'teleport' }),
    Object.assign({}, good, { species: 99999 }),
    Object.assign({}, good, { ivs: '1/2/3' }),
    Object.assign({}, good, { ivs: 'a/b/c/d/e/f' }),
    Object.assign({}, good, { level: 'twelve' }),
    Object.assign({}, good, { advance: -1 }),
    Object.assign({}, good, { advance: 2.5 }),
    'not an object', 42, null
  ];
  for (const b of broken) {
    A.setPref('gen3enc', { 'landed.ruby': b });
    const h = html();
    assert.doesNotMatch(h, /undefined/, 'a malformed record must not render: ' + JSON.stringify(b).slice(0, 60));
    assert.doesNotMatch(h, /vs your attempt/, 'and must not be treated as an attempt on record: ' + JSON.stringify(b).slice(0, 60));
    assert.equal(mode.line ? typeof mode.line('ruby') : 'string', 'string');
  }
  // the good one still works after all that, so this is a filter and not a blanket refusal
  A.setPref('gen3enc', { 'landed.ruby': good });
  assert.match(html(), /vs your attempt/);
});

test('the reported species does not outlive the map or the encounter type it was picked on', () => {
  reset();
  const maps = M.mapsWith(D, 'ruby', 'land');
  assert.ok(maps.length > 1, 'ruby has more than one land map');
  mode.onEvent(typeInto('g3e-map', maps[0].map), 'ruby');
  const dex = Number(Object.keys(D.gen3enc.species).find((k) => D.gen3enc.species[k] === M.slotsOf(D, maps[0], 'land')[0].species));
  mode.onEvent(typeInto('g3e-got-species', dex), 'ruby');
  assert.equal(A.pref('gen3enc', 'gotSpecies.ruby'), dex, 'the species is remembered on its own map');

  mode.onEvent(typeInto('g3e-map', maps[1].map), 'ruby');
  assert.equal(A.pref('gen3enc', 'gotSpecies.ruby'), undefined, 'switching map clears it');
  // no search verdict of any kind is printed: neither a hit list nor a "no advance generates it here" warning
  const after = html();
  assert.doesNotMatch(after, /advances? between 0 and/, 'and the panel is not searching for it any more');

  mode.onEvent(typeInto('g3e-map', maps[0].map), 'ruby');
  mode.onEvent(typeInto('g3e-got-species', dex), 'ruby');
  mode.onEvent(clickOn('[data-choice="g3e-kind"]', { 'data-id': 'water' }), 'ruby');
  assert.equal(A.pref('gen3enc', 'gotSpecies.ruby'), undefined, 'switching encounter type clears it too');
});
