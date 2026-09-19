// storyboard.test.cjs - the storyboard timelines are the data's scenes. Run: node --test tests/tid-helper/*.test.cjs
//   1. the scene list for red/gba/hold-start-v1 equals scene-timelines.json's scenes converted to seconds (frame /
//      (4194304/70224), [start, end) kept), for every anchor: menu (t = 0 at menu_open), power-on (t = 0 at frame 0),
//      reset (the console's fade + stall added);
//   2. offset-driven: the press marker is the ENGINE's press frame (menu_open + 80 + offset, where the cue's A tone
//      sounds; the trace's first A-down frame press_a is the next index, checked on every Gen 1 entry), the newgame scene
//      and the roll shift with it, the scenes before the press do not; the hold window and flash events are the data's
//      frames; every Gen 1 / Gen 2 methodology builds; press.t equals ShinyGen1Tid.schedule's tA at zero correction
//      (red/gba 358 under the menu and power-on anchors, red/dmg 100);
//   3. Gen 2: the press window is the engine's pressFrames for the bin and the roll is rollFrame (the RTC state's table);
//      R/S: the anchor block's frames; segmentAt / inputsAt.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines(), S = H.page('page-storyboard.js');
const fps = 4194304 / 70224;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' ' + a + ' vs ' + b);

test('red/gba/hold-start-v1: the scene list equals scene-timelines.json in seconds, under every anchor', () => {
  const id = 'red/gba/hold-start-v1', e = D.scenes.methodologies[id];
  assert.equal(S.fpsOf(D.scenes.fps_expression), fps);
  const secs = S.scenesSeconds(D, id);
  assert.deepEqual(secs.map((s) => [s.id, s.label, s.startF, s.endF]), e.scenes.map((s) => [s.id, s.label, s.start, s.end]));
  secs.forEach((s, i) => { near(s.startS, e.scenes[i].start / fps); near(s.endS, e.scenes[i].end / fps); });
  const tracedOffset = e.events.offset_used;
  for (const [anchor, originF, extra] of [['menu', e.events.menu_open, 0], ['poweron', 0, 0], ['reset', 0, E.G1.resetAnchorExtraSeconds(D.gen1.reset_models['gbp-fade'])]]) {
    const tl = S.gen1Timeline(D, id, tracedOffset, anchor, extra);
    assert.equal(tl.segments.length, e.scenes.length, anchor + ': one segment per scene');
    tl.segments.forEach((s, i) => {
      assert.equal(s.id, e.scenes[i].id); assert.equal(s.label, e.scenes[i].label);
      near(s.t0, (e.scenes[i].start - originF) / fps + extra, anchor + ' ' + s.id + ' start');
      near(s.t1, (e.scenes[i].end - originF) / fps + extra, anchor + ' ' + s.id + ' end');
    });
    // the marker is the engine's press frame, one harness index before the trace's first A-down frame
    near(tl.press.t, (e.events.press_a - 1 - originF) / fps + extra, anchor + ' press'); assert.equal(tl.press.frame, e.events.press_a - 1); assert.equal(tl.press.tracedADownFrame, e.events.press_a);
    near(tl.roll.t, (e.events.roll - originF) / fps + extra, anchor + ' roll');
    const hold = tl.events.find((x) => x.kind === 'hold'); near(hold.t, (e.events.hold_lo - originF) / fps + extra); near(hold.t1, (e.events.hold_hi - originF) / fps + extra);
    const flash = tl.events.find((x) => x.kind === 'flash'); near(flash.t, (e.events.flash_visible_start - originF) / fps + extra); near(flash.t1, (e.events.flash_last_white + 1 - originF) / fps + extra);
    assert.ok(tl.notes.includes(D.scenes.frame_convention) && tl.notes.includes(D.scenes.status), 'the data\'s convention and status ride along');
  }
  assert.throws(() => S.gen1Timeline(D, 'red/gba/nope', 1, 'menu', 0), /no entry/);
});

test('offset-driven Gen 1: the press marker is the engine\'s menu_open + 80 + offset (the trace\'s A-down frame is the next), later scenes shift, earlier ones do not; every methodology builds', () => {
  const id = 'red/gba/hold-start-v1', e = D.scenes.methodologies[id];
  // the data: on every Gen 1 trace the first A-down frame is menu_open + 1 + 80 + offset_used
  for (const [mid, m] of Object.entries(D.scenes.methodologies)) if (mid in D.gen1.methodologies) assert.equal(m.events.press_a, m.events.menu_open + 1 + D.gen1.menu_to_table_frames + m.events.offset_used, mid + ' press_a');
  for (const offset of [0, 100, 743, 1131, 2399]) {
    const tl = S.gen1Timeline(D, id, offset, 'menu', 0);
    const pressF = e.events.menu_open + D.gen1.menu_to_table_frames + offset, delta = pressF + 1 - e.events.press_a;
    assert.equal(tl.press.frame, pressF, 'offset ' + offset);
    assert.equal(tl.roll.frame, e.events.roll + delta);
    const ng = tl.segments.find((s) => s.id === 'newgame'), menu = tl.segments.find((s) => s.id === 'menu'), title = tl.segments.find((s) => s.id === 'title');
    assert.equal(ng.f0, e.scenes.find((s) => s.id === 'newgame').start + delta); assert.equal(menu.f1, ng.f0); assert.equal(menu.f0, e.scenes.find((s) => s.id === 'menu').start);
    assert.equal(title.f0, e.scenes.find((s) => s.id === 'title').start, 'the title scene does not move');
    assert.ok(tl.press.t > menu.t0 && tl.press.t < menu.t1, 'the press lies inside the menu scene');
    const a = tl.inputs.find((b) => b.kind === 'press'); near(a.t0, tl.press.t);
    assert.ok(tl.notes.some((n) => /Press convention: .*menu_open \+ 80 \+ offset/.test(n)), 'the convention is stated in the notes');
  }
  for (const id2 of Object.keys(D.gen1.methodologies)) { const tl = S.gen1Timeline(D, id2, 50, 'poweron', 0); assert.ok(tl.segments.length > 5 && tl.tMax > tl.tMin, id2); }
  for (const id2 of Object.keys(D.gen2.methodologies)) { const tl = S.gen2Timeline(D, E.G2, id2, 10, 'menu', 0, 'days0'); assert.ok(tl.segments.length > 5, id2); }
});

test('Gen 1 press marker == the cue\'s A tone: press.t equals ShinyGen1Tid.schedule\'s tA at zero correction (red/gba 358 menu + power-on, red/dmg 100)', () => {
  for (const [mid, offset] of [['red/gba/hold-start-v1', 358], ['red/dmg/hold-start-v1', 100]]) {
    const timing = D.gen1.methodologies[mid].timing, e = D.scenes.methodologies[mid];
    const menu = S.gen1Timeline(D, mid, offset, 'menu', 0), pw = S.gen1Timeline(D, mid, offset, 'poweron', 0);
    near(menu.press.t, E.G1.schedule('menu', offset, 0).tA, mid + ' menu anchor: press.t == tA');
    near(menu.press.t, E.G1.targetSeconds(offset), mid + ' menu anchor: targetSeconds');
    near(pw.press.t, E.G1.schedule('poweron', offset, 0, { family: timing }).tA, mid + ' power-on anchor: press.t == tA');
    assert.equal(menu.press.frame, e.events.menu_open + E.G1.pressFrameFromMenu(offset), mid + ': the marker frame is the engine\'s');
    assert.equal(menu.press.frame + 1, e.events.press_a + (offset - e.events.offset_used), mid + ': the trace\'s A-down frame is one index later');
    near(menu.roll.t - menu.press.t, (e.events.roll_minus_press + 1) / fps, mid + ': the roll stays A-down + roll_minus_press');
    const a = menu.inputs.find((b) => b.kind === 'press'); near(a.t0, menu.press.t, mid + ': the A band starts on the marker');
  }
});

test('Gen 2: press window = the engine\'s pressFrames, roll = rollFrame for the RTC state; R/S: the anchor block; segmentAt', () => {
  const id = 'gold/gbp/hold-start-v1', e = D.scenes.methodologies[id], m = D.gen2.methodologies[id];
  for (const [bin, state] of [[23, 'days0'], [0, 'days0'], [598, 'days512'], [300, 'halt-days0']]) {
    const tl = S.gen2Timeline(D, E.G2, id, bin, 'menu', 0, state);
    const look = E.G2.lookup(D.gen2, 'gold', 'gbp', state, bin);
    assert.deepEqual(tl.press.frames, look.pressFrames, 'bin ' + bin);
    near(tl.press.t, (look.pressFrames[0] - e.events.menu_visible) / fps);
    assert.equal(tl.roll.frame, look.rollFrame); assert.equal(tl.state, state);
    near(tl.events.find((x) => x.kind === 'accept').t, (look.acceptFrame - e.events.menu_visible) / fps);
    assert.ok(tl.segments.filter((s) => s.skipped).length === 2, 'the two skipped scenes (splash honoured) stay marked');
  }
  const traced = S.gen2Timeline(D, E.G2, id, E.G2.binOf(e.events.offset_used, E.G2.binRule(D.gen2, 'gold')), 'poweron', 0, 'days0');
  assert.equal(traced.roll.frame, e.events.roll, 'at the traced offset the engine\'s roll frame is the trace\'s');
  assert.equal(traced.segments.find((s) => s.id === 'newgame').f0, e.scenes.find((s) => s.id === 'newgame').start);
  assert.equal(m.timing.visible_menu_frame, e.events.menu_visible);
  // R/S
  const g = D.gen3rs.games.sapphire, a = g.model.anchor, gfps = 16777216 / 280896;
  const rs = S.rsTimeline(D, 'sapphire', 4500, g.model.p_min_frames);
  near(rs.press.t, (4500 - a.first_game_frame_to_copyright_visible) / gfps);
  assert.deepEqual(rs.segments.map((s) => s.id), ['white', 'copyright-fade', 'copyright', 'fade-black', 'opening', 'lastbox', 'write']);
  assert.equal(rs.segments[2].f0, a.first_game_frame_to_copyright_text_fully_visible); assert.equal(rs.segments[3].f1, a.first_game_frame_to_black_after_copyright);
  assert.equal(rs.segments[6].f1, 4500 + g.model.press_to_write_frames);
  assert.ok(rs.notes.includes(a.notes));
  const tl = S.gen1Timeline(D, 'red/gba/hold-start-v1', 358, 'poweron', 0);
  const red = D.scenes.methodologies['red/gba/hold-start-v1'];
  assert.equal(S.segmentAt(tl, 0.1).id, 'power_on'); assert.equal(S.segmentAt(tl, red.events.menu_visible / fps + 0.01).id, 'menu', 'menu_visible opens the menu scene');
  assert.equal(S.segmentAt(tl, 1700 / fps).id, 'menu'); assert.equal(S.segmentAt(tl, 9999), null);
  assert.deepEqual(S.inputsAt(tl, 1400 / fps).map((b) => b.text), ['HOLD START']);
});
