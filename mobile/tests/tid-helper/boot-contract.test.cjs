// boot-contract.test.cjs - the things that are only true in a browser, checked without one.
//
// THE BUG THIS EXISTS FOR, twice over on 2026-09-20. Adding the Gen 4 and Gen 5 modes broke the live page
// in two ways, and the suite stayed green through both:
//
//   1. bindData() gained three required engines. The BROWSER's call in page-render.js boot() was never
//      updated, so the page threw "ShinyGen4 engine missing" on load and rendered nothing. Every node test
//      passed because tests/tid-helper/helpers.cjs builds its own engines object - a test that supplies the
//      dependencies itself can never notice the real caller failing to.
//   2. Both new modes declared `games: Object.keys(A.D.gen4.games)` at REGISTRATION time. Registration runs
//      at script load; A.D does not exist until boot() calls bindData(). The modules threw, never reached
//      registerMode(), and nine games silently vanished from the home screen. Every node test passed because
//      they drive the pure layer directly and never touch registration.
//
// The headless-Chrome smoke test does catch both, and it had been SKIPPED for the whole life of this suite
// because node 18 has no global WebSocket. These checks need neither Chrome nor a particular node.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');
const src = path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

test('the browser boot passes every engine bindData demands', () => {
  const app = read('page-app.js');
  const body = app.slice(app.indexOf('function bindData'), app.indexOf('function bindData') + 2000);
  // what bindData refuses to start without
  const required = [...body.matchAll(/!engines\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(required.length >= 4, 'could not read bindData\'s engine checklist, found ' + JSON.stringify(required));

  const render = read('page-render.js');
  const call = render.slice(render.indexOf('A.bindData('), render.indexOf('A.bindData(') + 400);
  const supplied = [...call.matchAll(/([A-Za-z0-9_]+)\s*:\s*root\./g)].map((m) => m[1]);
  for (const k of required) {
    assert.ok(supplied.includes(k),
      'page-render.js boot() does not pass "' + k + '", which bindData refuses to start without - the page '
      + 'will throw on load. Supplied: ' + JSON.stringify(supplied));
  }
  // and the test helper must demand the same set, or the suite is easier to satisfy than the browser
  const helpers = fs.readFileSync(path.join(__dirname, 'helpers.cjs'), 'utf8');
  const eng = helpers.slice(helpers.indexOf('function engines'), helpers.indexOf('function engines') + 600);
  for (const k of required) {
    assert.ok(new RegExp('\\b' + k + '\\s*:').test(eng), 'helpers.cjs does not provide "' + k + '" either');
  }
});

test('every engine global the page names is really defined by an inlined engine', () => {
  const render = read('page-render.js');
  const call = render.slice(render.indexOf('A.bindData('), render.indexOf('A.bindData(') + 400);
  const globals = [...call.matchAll(/root\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(globals.length >= 5, 'expected several engine globals, found ' + JSON.stringify(globals));
  // a global may come from an engine in src/lib/shiny OR from another page module (page-gen3-rs.js defines
  // root.TidHelperGen3Rs) - both are inlined into the same page, so both count
  const all = fs.readdirSync(H.SHINY).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(H.SHINY, f), 'utf8'))
    .concat(fs.readdirSync(src).filter((f) => f.endsWith('.js')).map((f) => read(f))).join('\n');
  for (const g of globals) {
    if (g === 'TID_HELPER_DATA') continue;                       // the data, not an engine
    assert.ok(new RegExp('root\\.' + g + '\\s*=').test(all),
      'page-render.js binds root.' + g + ', which no engine in src/lib/shiny defines - it will be undefined at boot');
  }
});

test('no mode computes its game list from A.D, which does not exist when modes register', () => {
  // registerMode runs at script load; bindData runs on DOMContentLoaded. Reading A.D in a registration
  // argument is a TypeError that costs the whole mode, silently.
  const offenders = [];
  for (const f of fs.readdirSync(src).filter((x) => /^page-.*\.js$/.test(x))) {
    const txt = read(f);
    const i = txt.indexOf('A.registerMode(');
    if (i < 0) continue;
    const call = txt.slice(i, i + 700);
    // `games:` is evaluated immediately; line/sub/render are functions called later, when A.D does exist
    const m = /games:\s*([^,]+),/.exec(call);
    if (m && /\bA\.D\b/.test(m[1])) offenders.push(f + ': games: ' + m[1].trim());
  }
  assert.deepStrictEqual(offenders, [],
    'these modes read A.D while registering, which throws before registerMode() is reached and drops the mode '
    + 'from the app with no error anywhere:\n  ' + offenders.join('\n  '));
});

test('a mode registered for a game the home screen never lists is unreachable, and vice versa', () => {
  // games() in page-render.js builds the picker from data blocks; a mode whose games are not in one of them
  // can never be opened, and a data block with no mode shows an empty card.
  const D = H.data();
  const listed = new Set([].concat(
    Object.keys(D.gen1.games), Object.keys(D.gen2.games), Object.keys(D.gen3rs.games),
    Object.keys(D.gen3sid.games).filter((k) => D.gen3sid.games[k].status === 'sid'),
    Object.keys(D.gen4.games), Object.keys(D.gen5.games)));
  for (const g of ['diamond', 'soulsilver', 'black2', 'crystal', 'red']) {
    assert.ok(listed.has(g), g + ' is not listed by games(), so nothing for it can be opened');
  }
  // the Gen 4 / Gen 5 fallbacks in the page sources must name exactly the games their data ships, or a
  // missing data block would quietly register a different set than the home screen lists
  for (const [f, blk] of [['page-gen4.js', 'gen4'], ['page-gen5.js', 'gen5']]) {
    const m = /return g \? Object\.keys\(g\) : \[([^\]]*)\];/.exec(read(f));
    assert.ok(m, f + ' has no game-list fallback');
    const fallback = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
    assert.deepStrictEqual(fallback, Object.keys(D[blk].games).sort(), f + ' fallback disagrees with ' + blk + ' data');
  }
});
