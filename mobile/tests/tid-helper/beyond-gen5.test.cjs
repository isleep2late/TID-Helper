// beyond-gen5.test.cjs - the card that says why the app stops at Gen 5.
//
// WHY IT EXISTS. Asked whether there was a guide for the 3DS or Switch games, the honest answer had three
// parts and only one of them was "no":
//   - Gen 6, Gen 7 and Brilliant Diamond / Shining Pearl are SOLVED, and need homebrew to read the seed.
//   - Sword / Shield and Legends: Arceus are NOT POSSIBLE - the Trainer ID comes from a cryptographically
//     secure generator. That is a fact about those games, not a gap in anybody's tooling.
//   - Scarlet / Violet this project could not establish, and says so instead of guessing.
// Someone who only sees the list end at Gen 5 cannot tell those apart, so the page spells it out.
//
// The statuses live in the DATA, not in the page, because "not possible" is a checkable claim about a game
// and must not be softenable by whoever edits a template next. These tests keep it that way.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');
const src = path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper');
const A = H.app();
const D = H.data();
const B = D.sources.beyond;

test('the block exists, is dated, and every generation carries a status and somewhere to go', () => {
  assert.ok(B, 'tid-sources.json has no beyond block');
  for (const k of ['why', 'also', 'checked', 'generations', 'general']) assert.ok(B[k], 'beyond lacks ' + k);
  assert.match(B.checked, /^\d{4}-\d{2}-\d{2}$/, 'the block must say when it was checked - these claims go stale');
  const OK = new Set(['possible-with-homebrew', 'not-possible', 'not-established-here']);
  for (const g of B.generations) {
    for (const k of ['gen', 'games', 'console', 'status', 'what']) assert.ok(g[k], g.games + ' lacks ' + k);
    assert.ok(OK.has(g.status), g.games + ' has an unknown status: ' + g.status);
    assert.ok(Array.isArray(g.links) && g.links.length, g.games + ' offers no link, which is the point of the block');
    for (const l of g.links) { assert.ok(l.title, 'a link has no title'); assert.match(l.url, /^https:\/\//, l.title + ' is not https'); }
  }
  for (const l of B.general) assert.match(l.url, /^https:\/\//);
});

test('the three outcomes are all represented, or the card is not telling the whole story', () => {
  const by = {};
  B.generations.forEach((g) => { by[g.status] = (by[g.status] || 0) + 1; });
  assert.ok(by['possible-with-homebrew'] >= 3, 'Gen 6, Gen 7 and BDSP are all solved: ' + JSON.stringify(by));
  assert.ok(by['not-possible'] >= 2, 'Sword/Shield and Legends: Arceus cannot be done at all: ' + JSON.stringify(by));
  assert.ok(by['not-established-here'] >= 1, 'Scarlet/Violet is not established here and must say so');
  const names = B.generations.map((g) => g.games).join(' | ');
  for (const must of ['Sword', 'Legends: Arceus', 'Brilliant Diamond', 'Scarlet', 'Sun', 'Omega Ruby']) {
    assert.ok(names.includes(must), must + ' is missing from the card');
  }
});

test('the impossible ones say WHY, and are not filed as merely undone', () => {
  // the failure this guards: "Sword and Shield are not supported yet", which reads as a to-do and is wrong
  for (const g of B.generations.filter((x) => x.status === 'not-possible')) {
    assert.match(g.what, /cryptographically secure/i, g.games + ' must say why it is impossible, not just that it is');
  }
  // and Legends: Arceus must not be mistaken for "no RNG manip at all" - plenty works there, just not this
  const pla = B.generations.find((g) => /Arceus/.test(g.games));
  assert.match(pla.what, /OTHER RNG manipulation works/i, 'Legends: Arceus must distinguish Trainer ID from its other RNG');
});

test('3DSRNGTool is offered for both 3DS generations, and the seed reader with it', () => {
  const gen6 = B.generations.find((g) => /Omega Ruby/.test(g.games));
  const gen7 = B.generations.find((g) => /Ultra Sun/.test(g.games));
  for (const g of [gen6, gen7]) {
    assert.ok(g.links.some((l) => /3DSRNGTool/i.test(l.title)), g.gen + ' must offer 3DSRNGTool');
    assert.ok(g.links.some((l) => /NTR/i.test(l.title) || /ntr/i.test(l.url)), g.gen + ' must also offer the seed reader - the tool alone cannot get the seed');
    assert.match(g.what, /homebrew|custom firmware/i, g.gen + ' must say the seed needs homebrew');
  }
});

test('the card renders, sits at the bottom of the home screen, and the stale DS card is gone', () => {
  const html = A.beyondHtml();
  assert.ok(html && html.length > 200, 'beyondHtml produced nothing');
  assert.ok(html.includes('3DSRNGTool'), 'the rendered card must carry the tool name');
  assert.ok(html.includes('https://github.com/wwwwwwzx/3DSRNGTool'), 'and the link');
  assert.ok(/not possible at all/.test(html), 'the impossible cases must be labelled in the rendering too');
  assert.ok(/Checked 20\d\d-/.test(html), 'the rendering must carry the checked date');
  assert.ok(/need a connection/.test(html), 'it must say these links are not offline, unlike everything else');

  const render = fs.readFileSync(path.join(src, 'page-render.js'), 'utf8');
  const home = render.slice(render.indexOf('function homeHtml'), render.indexOf('function homeHtml') + 4000);
  assert.ok(/A\.beyondHtml\(\)/.test(home), 'the home screen does not include the card');
  // the card it replaced told people Gen 4 and Gen 5 were not in this app, which stopped being true
  assert.ok(!/data-open-shiny="g4"/.test(render),
    'the old "go to Shiny Solution for Gen 4/5" buttons are still on the home screen, directly contradicting the Gen 4 and Gen 5 modes');
});

test('the Data card lists what is actually embedded', () => {
  // it is a claim about the bundle's contents; leaving the new files out makes it a false one
  const render = fs.readFileSync(path.join(src, 'page-render.js'), 'utf8');
  const i = render.indexOf('<h3>Data</h3>');
  assert.ok(i > 0);
  const card = render.slice(i, i + 1200);
  for (const f of Object.values(H.FILES)) {
    assert.ok(card.includes(f), 'the Data card does not mention ' + f + ', which the bundle embeds');
  }
  for (const e of ['gen4.js', 'seedtime4.js', 'gen5.js']) {
    assert.ok(card.includes(e), 'the Data card does not mention the ' + e + ' engine, which the bundle inlines');
  }
});
