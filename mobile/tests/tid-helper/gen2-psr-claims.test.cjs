// gen2-psr-claims.test.cjs - two things the prescribed-sequence page said that were not so.
//
//  1. "Only two things are timed:" printed in front of a list of FOUR, two of which are deadlines a runner told
//     otherwise would simply miss - the backout's B-to-START switch, and the OPTION step's A eight frames after
//     DOWN with a four-frame window. The data had already been corrected and carries timed_elements_note saying
//     in as many words that the two-item claim was wrong and dangerous; the note was rendered nowhere, and the
//     sentence in front of the list was never updated to match it.
//  2. mountStory was handed a spec with no timeline function at all - the only one of the five mounts without
//     one - so the widget stored {error: "spec.timeline is not a function"}, printed that verbatim into the
//     notes under a blank canvas, and left a Preview button enabled that returned immediately.
// Run: node --test tests/tid-helper/gen2-psr-claims.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
const mounts = [];
A.widgets = {
  calibrationHtml: () => '', bindCalibration: () => {}, stopAll: () => {}, onStoryClick: () => {},
  onCalClick: () => {}, refit: () => {}, reset: () => {}, clearCalMsgs: () => {},
  storyWidgetHtml: (id, anchor, reason) => '<div data-story-reason="' + (reason ? 'given' : 'none') + '"></div>',
  mountStory: (spec) => { mounts.push(spec); }
};
// the real app wires A.Story in boot(); the mode reaches through it to build its timeline
A.Story = H.page('page-storyboard.js');
H.page('page-gen2-psr.js');
const D = H.data();
const mode = A.modes['gen2-psr'];

function renderWithRoute(game) {
  for (let tid = 0; tid < 400; tid++) {
    A.prefs = { version: 1 };
    mounts.length = 0;
    A.setPref('gen2psr', { ['tid.' + game]: String(tid) });
    const el = { innerHTML: '' };
    mode.render(el, game);
    if (mounts.length) return { tid, html: el.innerHTML, spec: mounts[0] };
  }
  return null;
}

test('the count of timed elements comes from the list, and the data\'s correction is on the page', () => {
  A.prefs = { version: 1 };
  const el = { innerHTML: '' };
  mode.render(el, 'crystal');
  const h = el.innerHTML;
  const te = D.gen2psr.timed_elements;
  assert.equal(te.length, 4, 'the data still lists four (if this changes, the sentence must follow it, which is the point)');
  assert.doesNotMatch(h, /Only two things are timed/, 'the claim that was wrong is gone');
  assert.match(h, /Four things are timed/, 'and the number matches the list');
  for (const item of te) {
    const head = item.split(/[,:(]/)[0].trim();
    assert.ok(h.includes(head), 'every timed element is still listed: ' + head);
  }
  assert.ok(D.gen2psr.timed_elements_note, 'the data carries the note');
  assert.ok(h.includes(D.gen2psr.timed_elements_note), 'and the page prints it, which it never used to');
  // the two deadlines that the two-item claim hid are named in the text a runner reads
  assert.match(h, /backout/i, 'the backout deadline is named');
  assert.match(h, /OPTION/, 'the OPTION step is named');
});

test('the prescribed-sequence storyboard is built, and never leaks a TypeError', () => {
  // This used to assert the opposite - that the mode correctly explained why it had no storyboard. It had none
  // because mountStory was handed a spec with no timeline at all, which the widget turned into
  // "spec.timeline is not a function" on the page. Explaining that away was the right first move and the wrong
  // resting place: the route's every span is a measured constant in the data, so it can simply be drawn.
  const r = renderWithRoute('crystal') || renderWithRoute('gold');
  assert.ok(r, 'some Trainer ID under 400 has a route to mount');
  assert.ok(r.spec, 'the storyboard is mounted');
  assert.equal(typeof r.spec.timeline, 'function', 'and it now has a timeline to draw');
  assert.ok(!r.spec.noTimelineReason, 'so there is no reason to print instead');
  assert.ok(r.html.includes('data-story-reason="none"'), 'and Preview is enabled');
  const tl = r.spec.timeline();
  assert.ok(!tl.error, 'the timeline builds: ' + tl.error);
  assert.ok(tl.segments.length >= 4 && tl.press && tl.roll, 'with scenes, a press and a roll');
  assert.doesNotMatch(r.html, /is not a function/, 'no JavaScript error text is shown to the runner');
});

test('the widget turns a missing timeline into a sentence, not an exception', () => {
  // page-widgets.js needs a real document to install itself, so its behaviour is checked through the same
  // contract the page relies on: a spec with no timeline must not throw, and must carry the caller's reason.
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'src', 'offline', 'tid-helper', 'page-widgets.js'), 'utf8');
  assert.match(src, /typeof spec\.timeline !== 'function'/, 'the missing case is handled before the call');
  assert.match(src, /noTimelineReason \|\|/, 'and the caller\'s sentence is preferred over a default');
  const before = src.indexOf("typeof spec.timeline !== 'function'");
  const call = src.indexOf('spec._tl = spec.timeline()');
  assert.ok(before > -1 && call > before, 'the guard comes before the call that used to throw');
});
