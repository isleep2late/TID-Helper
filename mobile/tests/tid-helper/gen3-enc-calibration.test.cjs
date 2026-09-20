// gen3-enc-calibration.test.cjs - the "What did you get?" loop of the Ruby/Sapphire encounter mode, driven
// through the mode's own render() and onEvent() rather than through its pure functions. The page used to
// describe this loop and provide no way to perform it: matchesFor was exported and nothing ever called it.
//   1. an encounter the engine generated at a known advance is typed back in and offered as that advance,
//      recorded as the runner's own, and the table is then readable relative to it
//   2. an under-specified report shows every candidate and says what would separate them
//   3. Rock Smash - where most advances generate nothing - renders and calibrates without throwing, and an
//      advance with no encounter cannot be recorded as anybody's attempt
//   4. an attempt recorded elsewhere is not silently compared against a different map or encounter type
//   5. nothing in the mode turns an advance into a time: no seconds, no cue, no countdown
//
// The mode installs its UI only when a document exists, so one is put in place before the module is required.
// Nothing below touches the DOM: render() is handed an object with an innerHTML field and writes HTML to it,
// and onEvent() is handed the same event shape page-render.js delegates.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;            // how a page module finds the app in the browser
const M = H.page('page-gen3-enc.js');   // required after the document, so its UI block installs
const D = H.data();
const mode = A.modes['gen3-enc'];

function reset() { A.prefs = { version: 1 }; }
function html(game) { const el = { innerHTML: '' }; mode.render(el, game || 'ruby'); return el.innerHTML; }
function clickOn(selector, attrs) {
  const node = { getAttribute: (a) => (a in (attrs || {}) ? attrs[a] : null) };
  return { type: 'click', target: { closest: (sel) => (sel === selector ? node : null) } };
}
function typeInto(id, value) { return { type: 'input', target: { id: id, value: String(value) } }; }
const landed = (game) => A.pref('gen3enc', 'landed.' + (game || 'ruby'));
const count = (s, needle) => s.split(needle).length - 1;

test('an encounter is typed back in, matched to its advance, and the table is then read against it', () => {
  reset();
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  const r = M.encountersAt(D, 'ruby', m, 'land', 0, 400)[137];
  assert.ok(r && r.valid !== false, 'advance 137 generates an encounter to report');

  assert.match(html(), /What did you get\?/, 'the panel is on the page');
  assert.match(html(), /Pokemon you got/, 'and it asks for the encounter');
  assert.doesNotMatch(html(), /vs your attempt/, 'with nothing recorded there is nothing to compare against');

  mode.onEvent(typeInto('g3e-map', m.map), 'ruby');
  mode.onEvent(typeInto('g3e-span', 400), 'ruby');
  mode.onEvent(typeInto('g3e-got-species', r.species), 'ruby');
  mode.onEvent(typeInto('g3e-got-level', r.level), 'ruby');
  mode.onEvent(typeInto('g3e-got-nature', r.nature), 'ruby');
  const found = html();
  assert.match(found, /data-g3e-landed="137"/, 'the advance that generates it is offered');

  assert.equal(mode.onEvent(clickOn('[data-g3e-landed]', { 'data-g3e-landed': '137' }), 'ruby'), 'render');
  const L = landed();
  assert.equal(L.advance, 137, 'the advance is recorded as the runner\'s own');
  assert.equal(L.map, m.map);
  assert.equal(L.kind, 'land');
  // what is stored is the row the engine generates, not what was typed: a blank field would otherwise be
  // stored blank and printed blank for ever after
  assert.equal(L.species, r.species);
  assert.equal(L.level, r.level);
  assert.equal(L.nature, r.nature);
  assert.equal(L.ivs, r.ivArray.join('/'));
  assert.match(mode.line('ruby'), /advance 137/, 'the home screen says an attempt is on record');

  // and the table is now readable relative to it
  mode.onEvent(clickOn('[data-g3e-show-landed]', {}), 'ruby');
  assert.equal(A.pref('gen3enc', 'from.ruby'), 132, 'the window is moved to sit around the recorded advance');
  const rel = html();
  assert.match(rel, /vs your attempt/, 'the comparison column appears');
  assert.match(rel, /<td>your attempt<\/td>/, 'the recorded advance is marked rather than numbered');
  assert.match(rel, /<td>\+3<\/td>/, 'a later row is +3 advances later');
  assert.match(rel, /<td>-5<\/td>/, 'an earlier row is 5 advances earlier');
  assert.match(rel, /does not tell you what to do differently/, 'and the page says what the offset is not');

  // forgetting it puts the table back to raw advances
  mode.onEvent(clickOn('[data-g3e-forget]', {}), 'ruby');
  assert.equal(landed(), undefined, 'the recorded attempt is gone');
  assert.doesNotMatch(html(), /vs your attempt/);
});

test('an under-specified report shows every candidate and says what would separate them', () => {
  reset();
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  const r = M.encountersAt(D, 'ruby', m, 'land', 0, 1)[0];
  mode.onEvent(typeInto('g3e-map', m.map), 'ruby');
  mode.onEvent(typeInto('g3e-span', 400), 'ruby');
  mode.onEvent(typeInto('g3e-got-species', r.species), 'ruby');   // species alone: no level, no nature
  const hits = M.matchesFor(D, 'ruby', m, 'land', { species: r.species, level: null, nature: null }, 0, 400);
  assert.ok(hits.length > 1, 'the case under test really is ambiguous, got ' + hits.length);
  const h = html();
  assert.match(h, new RegExp(hits.length + ' advances between 0 and 399 generate'), 'it says how many there are');
  assert.match(h, /will not pick one for you/, 'and refuses to choose');
  assert.match(h, /What tells them apart/, 'it says what would disambiguate');
  // the tie-break offered is what a person can still check on the Pokemon: level, nature, IVs. Some advances
  // generate the same Pokemon as each other, and the page must count those out rather than promise a check
  // that cannot work.
  const key = (r) => r.level + '/' + r.nature + '/' + r.ivArray.join('/');
  const seen = {};
  for (const x of hits) seen[key(x)] = (seen[key(x)] || 0) + 1;
  const unique = hits.filter((x) => seen[key(x)] === 1).length;
  assert.ok(unique < hits.length, 'this case really does contain indistinguishable candidates');
  assert.match(h, new RegExp(unique + ' of the ' + hits.length + ' candidates can be told apart'), 'it counts them honestly');
  assert.match(h, /no check on the Pokemon can separate/, 'and does not promise a tie-break for the rest');
  assert.match(h, /nature is blank/, 'and names the field that was left out');
  assert.equal(count(h, 'data-g3e-landed='), Math.min(hits.length, 40), 'every candidate shown is selectable');
  // nothing is recorded until the runner picks one
  assert.equal(landed(), undefined);
});

test('Rock Smash renders and calibrates without throwing, and a no-encounter advance is not recordable', () => {
  reset();
  mode.onEvent(clickOn('[data-choice="g3e-kind"]', { 'data-id': 'rock_smash' }), 'ruby');
  const m = M.mapsWith(D, 'ruby', 'rock_smash')[0];
  mode.onEvent(typeInto('g3e-map', m.map), 'ruby');
  mode.onEvent(typeInto('g3e-span', 300), 'ruby');
  assert.doesNotThrow(() => html(), 'the mode renders with most advances producing nothing');
  assert.match(html(), /no encounter \(rock smash odds\)/, 'a failed odds roll is shown as such');

  const rows = M.encountersAt(D, 'ruby', m, 'rock_smash', 0, 300);
  const good = rows.find((x) => x.valid !== false), bad = rows.find((x) => x.valid === false);
  mode.onEvent(typeInto('g3e-got-species', good.species), 'ruby');
  mode.onEvent(typeInto('g3e-got-level', good.level), 'ruby');
  mode.onEvent(typeInto('g3e-got-nature', good.nature), 'ruby');
  assert.doesNotThrow(() => html(), 'the search over a Rock Smash table does not throw');
  assert.match(html(), new RegExp('data-g3e-landed="' + good.frame + '"'), 'the encounter matches back to its advance');

  // the button is only ever drawn on a matched row, but an advance that generates nothing has no species,
  // level or IVs to store - so recordLanded refuses it outright rather than storing blanks
  assert.equal(mode.onEvent(clickOn('[data-g3e-landed]', { 'data-g3e-landed': String(bad.frame) }), 'ruby'), null);
  assert.equal(landed(), undefined, 'nothing was recorded');
  assert.equal(mode.onEvent(clickOn('[data-g3e-landed]', { 'data-g3e-landed': String(good.frame) }), 'ruby'), 'render');
  assert.equal(landed().advance, good.frame, 'a real encounter is recorded');
});

test('an attempt recorded on one map is not compared against another', () => {
  reset();
  const land = M.mapsWith(D, 'ruby', 'land')[0];
  mode.onEvent(typeInto('g3e-map', land.map), 'ruby');
  mode.onEvent(clickOn('[data-g3e-landed]', { 'data-g3e-landed': '42' }), 'ruby');
  assert.equal(landed().advance, 42);
  assert.match(html(), /vs your attempt/, 'on its own map the comparison stands');

  mode.onEvent(clickOn('[data-choice="g3e-kind"]', { 'data-id': 'water' }), 'ruby');
  const h = html();
  assert.equal(landed().advance, 42, 'the recorded attempt is kept');
  assert.doesNotMatch(h, /vs your attempt/, 'but it is not applied to another encounter type');
  assert.match(h, /do not belong on one axis/, 'and the page says why');
});

test('nothing in the mode turns an advance into a time', () => {
  // the advances-per-press figure has not been derived for these games (gen3-enc.json not_derived[0]), so a
  // second, a frame count, a countdown or a cue anywhere in this mode would be an invented timing model.
  reset();
  const m = M.mapsWith(D, 'ruby', 'land')[0];
  mode.onEvent(typeInto('g3e-map', m.map), 'ruby');
  mode.onEvent(clickOn('[data-g3e-landed]', { 'data-g3e-landed': '137' }), 'ruby');
  const h = html();
  // the page's own working area: cards 3 and 4. Everything outside them is the data's own prose, which does
  // quote hardware timings (the FR/LG reason cites a 3.9 ms timer wrap) and frame conventions in the credits.
  const work = h.slice(h.indexOf('3. What you would get'), h.indexOf('<h3>Credit</h3>'));
  assert.ok(work.length > 500, 'found the working area');
  assert.doesNotMatch(work, /\d+\.\d+ s\b/, 'no formatted seconds (A.fmtS)');
  assert.doesNotMatch(work, /\d+ ms\b/, 'no milliseconds');
  assert.doesNotMatch(work, /frames?\b/, 'no frame counts: an advance is not a frame here');
  for (const hook of ['data-story', 'data-cal', 'data-g3e-run', 'countInCues']) {
    assert.ok(h.indexOf(hook) === -1, 'no cue or timer widget is mounted: ' + hook);
  }
  assert.match(h, /has not been measured for these games/, 'the page says the number is missing');
});
