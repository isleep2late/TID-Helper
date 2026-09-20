// rs-anchor.test.cjs - the Ruby / Sapphire mode anchors its instruction and its arithmetic on the SAME instant.
//
// WHAT WAS WRONG. The page told the runner "tap when the copyright screen appears" and the Run button said "tap at
// the copyright screen", while pressSeconds() counted from first_game_frame_to_copyright_visible - which gen3-rs.json
// defines as the first frame with non-white pixels, the start of the palette fade out of white, three uniform-white
// frames in. The same anchor block records first_game_frame_to_copyright_text_fully_visible 17 frames (284.6 ms)
// later. Every cue was built 17 frames long on a target where P-1 and P+1 give different Trainer IDs, and the data
// supplies no default correction to absorb it.
//
// The call sites are inside the UI closure, so the pure functions alone cannot see the defect: these drive the mode's
// own render() through a stand-in document, the way page-render.js drives it in the app.
// Run: node --test tests/tid-helper/rs-anchor.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

globalThis.document = { getElementById: () => null };
const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;
A.Story = H.page('page-storyboard.js');   // the browser binds this; the mounted timeline is checked below

// the storyboard widget is a canvas in the app; here it only has to hand back what the mode passed it
let story = null, anchorLabel = null;
A.widgets = { calibrationHtml: () => '', bindCalibration: () => {}, stopAll: () => {}, onStoryClick: () => {}, onCalClick: () => {},
  refit: () => {}, reset: () => {}, clearCalMsgs: () => {},
  storyWidgetHtml: (id, label) => { anchorLabel = label; return '<button>Run: tap at ' + label + '</button>'; },
  mountStory: (spec) => { story = spec; } };
const RS = H.page('page-gen3-rs.js');
const D = H.data(), E = H.engines();
const mode = A.modes['gen3-rs'];
const FPS = E.core.GBA_FPS;

function reset() { A.prefs = { version: 1 }; story = null; anchorLabel = null; }
function render(game, prefs) {
  reset();
  if (prefs) A.setPref('rs', prefs);
  const el = { innerHTML: '' };
  mode.render(el, game);
  return el.innerHTML;
}

test('the two instants the data records, and how far apart they are', () => {
  for (const game of ['ruby', 'sapphire']) {
    const a = D.gen3rs.games[game].model.anchor;
    const ca = RS.copyrightAnchor(D, game);
    assert.equal(ca.fadeFrame, a.first_game_frame_to_copyright_visible, game + ': the fade start is the data\'s');
    assert.equal(ca.visibleFrame, a.first_game_frame_to_copyright_text_fully_visible, game + ': the fully drawn text is the data\'s');
    assert.equal(ca.lagFrames, ca.visibleFrame - ca.fadeFrame);
    assert.ok(Math.abs(ca.lagS - ca.lagFrames / FPS) < 1e-12, game + ': the gap in seconds is the data\'s fps');
    // the measured gap: 17 frames, 284.6 ms, against a frame of 16.74 ms
    assert.equal(ca.lagFrames, 17, game);
    assert.equal((ca.lagS * 1000).toFixed(1), '284.6', game);
    assert.equal((1000 / FPS).toFixed(2), '16.74', 'one GBA frame');
    // REGRESSION: the arithmetic counted from the fade start while the instruction named a readable screen
    assert.equal(RS.anchorFrame(D, game), ca.visibleFrame, game + ': the arithmetic counts from the fully drawn text');
    assert.notEqual(RS.anchorFrame(D, game), ca.fadeFrame, game + ': not from the first non-white pixel');
    const P = D.gen3rs.games[game].model.p_min_frames + 300;
    assert.ok(Math.abs(RS.pressSeconds(D, game, P) - (P - ca.visibleFrame) / FPS) < 1e-12, game + ': the press second is measured from the fully drawn text');
    // the cue is the same second minus the correction, so it moves with the anchor and not independently of it
    const c = RS.cueProgram(E.G1, D, game, P, 0, 4, 1.0);
    assert.ok(Math.abs(c.tA - (P - ca.visibleFrame) / FPS) < 1e-12, game + ': the A tone sits at the press second after the fully drawn text');
    assert.ok(Math.abs(c.tA - (P - ca.fadeFrame) / FPS) > 0.28, game + ': and NOT 17 frames later, which is what the fade-start anchor gave');
  }
});

test('the rendered page tells the runner to tap on the instant its numbers count from, and says how far the other one is', () => {
  for (const game of ['ruby', 'sapphire']) {
    const ca = RS.copyrightAnchor(D, game);
    const g = D.gen3rs.games[game], P = g.model.p_min_frames + 300;
    const html = render(game, { aimedP: P });

    // 1. the button the runner taps names the readable screen, not "the copyright screen" (which was the fade start)
    assert.ok(anchorLabel, game + ': the storyboard widget was built');
    assert.notEqual(anchorLabel, 'the copyright screen', game + ': REGRESSION - the Run button named a screen the numbers did not count from');
    assert.match(anchorLabel, /fully drawn/, game + ': the Run button names the fully drawn text: ' + anchorLabel);

    // 2. the instruction says which frame it means, and how far the fade start is from it
    assert.match(html, /Tap when the copyright text is fully drawn/, game + ': the instruction names the instant');
    assert.ok(html.includes('(frame ' + ca.visibleFrame + ')'), game + ': the frame the runner taps on is on the page');
    assert.ok(html.includes(ca.lagFrames + ' frames (284.6 ms) earlier, on frame ' + ca.fadeFrame),
      game + ': the page states the gap between the two instants in frames and ms');

    // 3. every second the page prints is measured from that same frame: seconds * fps + that frame == P
    const m = /= ([0-9.]+) s after the copyright text is fully drawn \(frame (\d+)\)/.exec(html);
    assert.ok(m, game + ': the aim line says what its seconds are measured from');
    assert.equal(Number(m[2]), ca.visibleFrame, game);
    assert.equal(Number(m[1]).toFixed(2), ((P - ca.visibleFrame) / FPS).toFixed(2), game + ': the aim is the press second from the fully drawn text');
    // REGRESSION: the same aim line under the fade-start anchor, 0.28 s longer
    assert.notEqual(Number(m[1]).toFixed(2), ((P - ca.fadeFrame) / FPS).toFixed(2), game + ': it is not the fade-start second');

    // 4. the generated protocol still quotes frame 4, so the page has to reconcile the two rather than print both flat
    assert.ok(g.methodology.protocol.some((s) => s.includes('frame ' + ca.fadeFrame)), game + ': the data\'s own protocol does quote the fade frame');
    assert.match(html, /quoting the first frame with non-white pixels/, game + ': the page names the difference under the protocol');
  }
});

test('the storyboard and the cue share one origin, so the scene on the canvas is the scene at the tone', () => {
  for (const game of ['ruby', 'sapphire']) {
    const ca = RS.copyrightAnchor(D, game);
    const g = D.gen3rs.games[game], P = g.model.p_min_frames + 300;
    render(game, { aimedP: P });
    assert.ok(story && typeof story.timeline === 'function', game + ': a timeline was mounted');
    const tl = story.timeline();
    assert.ok(!tl.error, game + ': ' + tl.error);
    // the canvas is drawn at the cue engine's clock, so t = 0 on the timeline must be the instant the runner taps
    assert.ok(Math.abs(tl.press.t - RS.pressSeconds(D, game, P)) < 1e-9,
      game + ': the press marker sits at the cue\'s press second (timeline ' + tl.press.t + ', cue ' + RS.pressSeconds(D, game, P) + ')');
    assert.equal(tl.press.frame, P, game);
    // the white frames before the anchor are now BEHIND it, by the same gap
    assert.ok(Math.abs(tl.tMin + ca.visibleFrame / FPS) < 1e-9, game + ': frame 0 sits ' + ca.visibleFrame + ' frames before t = 0');
    assert.match(tl.originLabel, /fully drawn/, game + ': the storyboard notes name the same instant as the button');

    // rsTimeline itself is now built on the fully drawn text, so the mode passes it straight through: there is
    // no re-basing step left to drift out of step with the cue. This assertion is what said the shift had to
    // come out once the origin moved, and it is now what says the two must never part again.
    const raw = A.Story.rsTimeline(D, game, P, g.model.p_min_frames);
    assert.ok(Math.abs(raw.press.t - tl.press.t) < 1e-9,
      game + ': the mode shows rsTimeline unchanged (' + raw.press.t + ' vs ' + tl.press.t + ')');
    assert.ok(Math.abs(raw.tMin + ca.visibleFrame / FPS) < 1e-9,
      game + ': and rsTimeline\'s own origin is the fully drawn text, not the fade start ' + ca.lagFrames + ' frames before it');
    assert.equal(typeof RS.reanchorTimeline, 'undefined', 'the workaround is gone, not merely unused');
  }
});

test('samples taken under the old anchor are not averaged into the new one', () => {
  // a correction calibrated while the page counted from the fade start carries the 284.6 ms inside it; reused under
  // the fully drawn text it would put every press 17 frames EARLY, so the store is keyed by the anchor as well
  const game = 'ruby';
  reset();
  A.setPref('rs', { aimedP: D.gen3rs.games[game].model.p_min_frames + 300 });
  A.setCal('rs.' + game, { samples: [{ tid: 1, aimed: 5000, hit: 5000, correction_used_ms: 384.6, implied_ms: 384.6, methodology: D.gen3rs.games[game].methodology.id }], override: null });
  mode.render({ innerHTML: '' }, game);
  const keys = Object.keys(A.prefs.cal || {});
  assert.ok(keys.includes('rs.' + game), 'the old store is left alone rather than deleted');
  assert.ok(!keys.includes('rs.' + game + '.copyright-text') || A.cal('rs.' + game + '.copyright-text').samples.length === 0,
    'nothing from the old store is carried into the new one');
  assert.equal(A.cal('rs.' + game + '.copyright-text').samples.length, 0, 'the new anchor starts with no samples');
});
