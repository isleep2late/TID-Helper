// sources.test.cjs - tid-sources.json (the published-manipulation citations) and the TidSources module over it. Run: node --test tests/tid-helper/*.test.cjs
//   1. the module's own check passes on the shipped file, every entry names games the pages serve, every Trainer ID is 4 upper-case
//      hex digits, every url is https and unique per (url, tid, games), every video url is a YouTube watch url;
//   2. the outcome logic: a documented ID is "documented" whatever provenance is passed; an undocumented ID is "community" or
//      "derived" exactly as passed; the label and text are the data's own strings;
//   3. the anchors the owner asked for: Red 0x64C2 cites entrpntr's 2017 video as its original source, first;
//   4. the page's source block escapes and links: every entry url appears as an href with data-ext, and no label text is typed
//      into a page source (the anti-retype scan in html.test.cjs guards validation phrases; this guards the labels).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');

const D = H.data(), TS = H.engines().TS;

test('tid-sources.json: shape, games, ids, urls', () => {
  TS.check(D.sources);
  const served = new Set([...Object.keys(D.gen1.games), ...Object.keys(D.gen2.games), ...Object.keys(D.gen3sid.games), ...Object.keys(D.gen3rs.games),
    'diamond', 'pearl', 'platinum', 'heartgold', 'soulsilver', 'black', 'white', 'black2', 'white2']);
  const seen = new Set();
  for (const e of D.sources.entries) {
    for (const g of e.games) assert.ok(served.has(g), 'served game: ' + g);
    if (e.tid !== null) assert.match(e.tid, /^[0-9A-F]{4}$/);
    assert.match(e.url, /^https:\/\//);
    if (e.kind === 'video') assert.match(e.url, /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/, 'a video is a YouTube watch url: ' + e.url);
    assert.ok(e.what && e.what.length > 10, 'what sentence: ' + e.title);
    assert.equal(typeof e.verified, 'string');
    const k = e.url + '|' + e.tid + '|' + e.games.join(',');
    assert.ok(!seen.has(k), 'unique: ' + k); seen.add(k);
    if (e.route) { assert.ok(e.route.title && /^https:\/\//.test(e.route.url), 'route doc for ' + e.title); }
  }
  assert.ok(D.sources.entries.length >= 50, 'the registry is populated: ' + D.sources.entries.length);
  assert.ok(D.sources.entries.some((e) => e.kind === 'list' && e.games.includes('red')), 'the Red community list is cited');
  assert.ok(D.sources.entries.some((e) => e.kind === 'list' && e.games.includes('yellow')), 'the Yellow community list is cited');
});

test('describe: documented overrides provenance; otherwise the provenance passed; label and text are the data\'s', () => {
  TS.bind(D.sources);
  const L = D.sources.labels;
  const doc = TS.describe('red', 0x64C2, 'community');
  assert.equal(doc.kind, 'documented'); assert.equal(doc.label, L.documented.label); assert.equal(doc.text, L.documented.text);
  assert.equal(TS.describe('red', 0x64C2, 'derived').kind, 'documented');
  // an ID no source names (checked, not assumed)
  let free = null;
  for (let t = 0x1000; t < 0x2000 && free === null; t++) if (!TS.forTid('red', t).length) free = t;
  assert.notEqual(free, null);
  const c = TS.describe('red', free, 'community'), d = TS.describe('red', free, 'derived');
  assert.equal(c.kind, 'community'); assert.equal(c.label, L.community.label); assert.equal(c.text, L.community.text); assert.equal(c.entries.length, 0);
  assert.equal(d.kind, 'derived'); assert.equal(d.label, L.derived.label); assert.equal(d.text, L.derived.text);
  // a game the registry does not know is simply undocumented
  assert.equal(TS.describe('blue', 0x64C2, 'derived').kind, 'derived', 'the Red 64C2 video is not attributed to Blue');
  assert.equal(TS.general('red').length > 0, true);
  assert.equal(TS.gameName('red'), D.sources.games.red);
});

test('Red 0x64C2: entrpntr\'s 2017 video is the first original source; Yellow 6415/64EA, Gold and Silver 09705, Crystal 09947 are documented', () => {
  TS.bind(D.sources);
  const e = TS.forTid('red', 0x64C2);
  assert.ok(e.length >= 1);
  assert.equal(e[0].url, 'https://www.youtube.com/watch?v=Jh7Z_frbfNs');
  assert.equal(e[0].author, 'entrpntr');
  assert.equal(e[0].date, '2017-03-19');
  assert.match(e[0].title, /0x64C2/);
  for (const [g, t] of [['yellow', 0x6415], ['yellow', 0x64EA], ['gold', 0x25E9], ['silver', 0x25E9], ['crystal', 0x26DB], ['blue', 0xB307]]) assert.ok(TS.forTid(g, t).length >= 1, g + ' ' + t.toString(16));
});

test('the page source block: links every entry, escapes, and types none of the labels', () => {
  const A = H.app();
  A.TS = TS; TS.bind(D.sources);
  const html = A.sourcesHtml('red', 0x64C2, 'community');
  for (const e of TS.forTid('red', 0x64C2)) assert.ok(html.includes('<a href="' + e.url + '" data-ext="1"'), 'linked: ' + e.url);
  assert.ok(html.includes('class="tag ok"'), 'a documented ID reads as confirmed');
  assert.ok(html.includes(A.esc(D.sources.labels.documented.text)));
  const derived = A.sourcesHtml('red', 0x1234, 'derived');
  assert.ok(derived.includes('class="tag warn"'), 'a derived ID is the warning');
  assert.ok(A.sourcesHtml('red', 0x1234, 'community').includes('class="tag"'), 'a community-list ID is neutral');
  const card = A.sourcesCard('red');
  assert.ok(card.includes('<h3>Sources</h3>') && card.includes('drive.google.com'), 'the card lists the general sources');
  // the label words come from the data, never from the page sources
  const files = [path.join(H.PAGE_DIR, 'page.html')].concat(H.PAGE_SCRIPTS.map((s) => path.join(H.PAGE_DIR, s)));
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const k of ['documented', 'community', 'derived']) assert.ok(!text.includes(D.sources.labels[k].text), path.basename(f) + ' retypes the ' + k + ' text');
  }
});

test('tools: EonTimer and FlowTimer are in the registry with https links; the page credit links them and types nothing of its own', () => {
  TS.bind(D.sources);
  const ids = TS.tools().map((t) => t.id);
  assert.ok(ids.includes('eontimer') && ids.includes('flowtimer'), 'tools: ' + ids.join(','));
  for (const t of TS.tools()) { assert.match(t.url, /^https:\/\//); assert.ok(t.author && t.what && t.name, t.id); for (const l of t.links || []) assert.match(l.url, /^https:\/\//); }
  const A = H.app(); A.TS = TS;
  const html = A.toolsHtml(['eontimer', 'flowtimer'], 'The cue here does what these do:');
  for (const id of ['eontimer', 'flowtimer']) { const t = TS.tool(id); assert.ok(html.includes('<a href="' + t.url + '" data-ext="1"'), id + ' linked'); assert.ok(html.includes(A.esc(t.what)), id + ' description from the data'); }
  assert.equal(A.toolsHtml(['no-such-tool']), '', 'an unknown id renders nothing');
  // no page source spells out a tool description of its own
  const files = [path.join(H.PAGE_DIR, 'page.html')].concat(H.PAGE_SCRIPTS.map((s) => path.join(H.PAGE_DIR, s)));
  for (const f of files) { const text = fs.readFileSync(f, 'utf8'); for (const t of TS.tools()) assert.ok(!text.includes(t.what), path.basename(f) + ' retypes the ' + t.id + ' description'); }
});
