// known-manip.test.cjs - "somebody has already published a manipulation of this exact Trainer ID".
//
// WHY. The owner asked the app for Crystal 62471 and got a prescribed-sequence route with no hint that
// CasualPokePlayer published a manipulation of that exact ID in 2020 - a video the registry has cited all
// along (entry: 0xF407, flowtimer offset 27680). The registry and the lookup both existed; the prescribed
// sequence mode was simply the one mode that never called them, so its answers looked like the only answer.
//
// 74 cited entries are videos naming an exact Trainer ID, over 50 IDs and 14 games - four of them Gen 4
// games this app has no mode for at all, which makes the citation the only thing it can offer there.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');
const src = path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper');
const A = H.app();
const D = H.data();

test('every mode that resolves one Trainer ID says where that ID comes from', () => {
  // the psr mode was the hole; a new mode with the same hole should fail here rather than ship silently
  for (const f of ['page-gen2.js', 'page-gen1-timed.js', 'page-gen1-buffer.js', 'page-gen2-psr.js']) {
    const txt = fs.readFileSync(path.join(src, f), 'utf8');
    assert.ok(/A\.sourcesHtml\(/.test(txt),
      f + ' resolves a Trainer ID but never calls A.sourcesHtml, so a published manip of that exact ID goes unmentioned');
  }
});

test('Crystal 62471 is recognised as already published, and names the video', () => {
  const d = A.TS.describe('crystal', 62471, 'derived');
  assert.equal(d.kind, 'documented', '62471 has a published manipulation and must be reported as such');
  const vids = d.entries.filter((e) => A.videoIdFromUrl(e.url));
  assert.ok(vids.length >= 1, 'the 62471 entry is a YouTube video and must be recognised as one');
  assert.equal(A.videoIdFromUrl(vids[0].url), '45jk3THdPPM', 'the video id must be extracted from the cited url');
  const html = A.sourcesHtml('crystal', 62471, 'derived');
  assert.ok(/There is already a published manipulation/.test(html), 'it must be spelled out, not left to a tag');
  assert.ok(html.includes('45jk3THdPPM'), 'the card must carry the video');
  assert.ok(/data-yt="45jk3THdPPM"/.test(html), 'there must be a button to watch it');
  // and it must not overclaim: ours is a different route to the same ID, not a correction of theirs
  assert.ok(/not a correction of theirs/.test(html));
});

test('a Trainer ID with no published manip says so plainly and offers no video', () => {
  // 3832 is one of this project's own derived routes, cited by nobody
  const d = A.TS.describe('crystal', 3832, 'derived');
  assert.equal(d.kind, 'derived');
  const html = A.sourcesHtml('crystal', 3832, 'derived');
  assert.ok(!/There is already a published manipulation/.test(html), 'it must not claim a source it does not have');
  assert.ok(!/data-yt=/.test(html), 'no video button where there is no video');
});

test('the embed is click-to-load, privacy-enhanced, and never in the rendered page until asked', () => {
  const html = A.sourcesHtml('crystal', 62471, 'derived');
  assert.ok(!/<iframe/.test(html), 'the result card must not contain an iframe - the bundle is offline until a tap');
  assert.ok(/loads from YouTube/.test(html), 'the button must say where it is about to go');
  const embed = A.videoEmbedHtml('45jk3THdPPM');
  assert.ok(/youtube-nocookie\.com/.test(embed), 'use the privacy-enhanced host, as the site component does');
  assert.ok(/rel=0/.test(embed), 'no related-video suggestions');
  assert.ok(/allowfullscreen/.test(embed));
  const r = fs.readFileSync(path.join(src, 'page-render.js'), 'utf8');
  assert.ok(/closest\('\[data-yt\]'\)/.test(r) && /A\.showVideo\(/.test(r), 'the watch click must be handled centrally');
});

test('videoIdFromUrl accepts the forms the registry actually holds, and rejects junk', () => {
  assert.equal(A.videoIdFromUrl('https://www.youtube.com/watch?v=45jk3THdPPM'), '45jk3THdPPM');
  assert.equal(A.videoIdFromUrl('https://youtu.be/45jk3THdPPM'), '45jk3THdPPM');
  assert.equal(A.videoIdFromUrl('https://www.youtube.com/watch?t=30&v=45jk3THdPPM'), '45jk3THdPPM');
  assert.equal(A.videoIdFromUrl('https://www.youtube.com/embed/45jk3THdPPM'), '45jk3THdPPM');
  assert.equal(A.videoIdFromUrl('https://pastebin.com/jWpbuv8G'), null, 'a pastebin is not a video');
  assert.equal(A.videoIdFromUrl('https://www.youtube.com/watch?v=tooshort'), null);
  assert.equal(A.videoIdFromUrl(''), null);
  assert.equal(A.videoIdFromUrl(null), null);
  // every cited youtube url in the shipped registry must yield an id, or its button would be dead
  const bad = (D.sources.entries || [])
    .filter((e) => /youtube\.com|youtu\.be/.test(e.url || ''))
    .filter((e) => !A.videoIdFromUrl(e.url));
  assert.deepStrictEqual(bad.map((e) => e.url), [], 'cited YouTube urls whose id could not be parsed');
});

test('the registry really does cover more than this app has modes for', () => {
  const vids = (D.sources.entries || []).filter((e) => e.tid && A.videoIdFromUrl(e.url));
  const games = new Set();
  vids.forEach((e) => (e.games || []).forEach((g) => games.add(g)));
  assert.ok(vids.length >= 70, 'expected ~74 cited manip videos, found ' + vids.length);
  for (const g of ['diamond', 'pearl', 'platinum', 'heartgold', 'soulsilver']) {
    assert.ok(games.has(g), 'Gen 4 ' + g + ' has cited manip videos and they should stay reachable');
  }
});
