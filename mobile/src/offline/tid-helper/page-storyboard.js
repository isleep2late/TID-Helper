// TID Helper page: the storyboard. A timeline (scene segments + events + input bands, all in seconds from the
// chosen anchor) is built ONLY from the data: scene-timelines.json for the Gen 1 / Gen 2 timed methods (frames ->
// seconds via its fps_expression; scene ranges [start, end); the Gen 1 press marker sits on the ENGINE's press frame
// menu_open + 80 + offset, the trace's A-down frame being the next one, see gen1Timeline), gen1-buffer.json's windows
// block composed by buffer-decode.js for the buffer guide (anchored on the Nintendo logo frame; the data's per-action
// seconds where it has them, see bufferTimeline), gen3-rs.json's anchor block for
// Ruby / Sapphire. The canvas draws SCHEMATIC scenes (shapes and labels, no game artwork) at the time the cue
// engine hands it; every number on screen is a timeline number. UMD: the timeline builders run under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TidHelperStoryboard = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';
  function fpsOf(expr) {
    var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(expr));
    if (!m) throw new Error('fps_expression is not a/b: ' + JSON.stringify(expr));
    return Number(m[1]) / Number(m[2]);
  }
  function fail(msg) { throw new Error(msg); }
  function sceneEntry(D, methId) {
    var e = D.scenes && D.scenes.methodologies && D.scenes.methodologies[methId];
    if (!e) fail('scene-timelines.json has no entry for ' + methId);
    return e;
  }
  // the data's scenes in seconds from harness frame 0 (no anchor shift, no offset shift)
  function scenesSeconds(D, methId) {
    var e = sceneEntry(D, methId), fps = fpsOf(D.scenes.fps_expression);
    return e.scenes.map(function (s) { return { id: s.id, label: s.label, startF: s.start, endF: s.end, startS: s.start / fps, endS: s.end / fps, skipped: !!s.skipped }; });
  }
  function mk(fps, originF, extraS) {
    return function (f) { return (f - originF) / fps + extraS; };
  }
  function base(kind, fps, originLabel) { return { kind: kind, fps: fps, originLabel: originLabel, segments: [], events: [], inputs: [], notes: [], tMin: 0, tMax: 0 }; }
  function finalize(tl) {
    var lo = Infinity, hi = -Infinity;
    tl.segments.forEach(function (s) { lo = Math.min(lo, s.t0); hi = Math.max(hi, s.t1); });
    tl.events.forEach(function (e) { lo = Math.min(lo, e.t); hi = Math.max(hi, e.t1 == null ? e.t : e.t1); });
    tl.tMin = isFinite(lo) ? lo : 0; tl.tMax = isFinite(hi) ? hi : 0;
    return tl;
  }

  // ---- Gen 1 timed method: scene-timelines, offset-driven --------------------------------------
  // anchor: 'menu' (t = 0 at menu_open, the data's detector frame; the box is drawn at menu_visible), 'poweron' or 'reset'
  // (t = 0 at power-on / at the reset press, extraS = the console's fade + stall).
  // PRESS CONVENTION (one for the marker, the A band and the cue): the press marker sits on the ENGINE's press frame,
  // pressF = menu_open + menu_to_table_frames + offset in harness index, the frame ShinyGen1Tid.pressFrameFromMenu /
  // targetSeconds name and the instant the cue's A tone sounds, so marker == tone. The trace's own press_a (scene_rules:
  // "first frame with A down") is the NEXT harness index: at offset_used, press_a = menu_open + 1 + menu_to_table_frames
  // + offset_used (storyboard.test.cjs checks that on every Gen 1 entry). For the chosen offset every traced frame from
  // the press on shifts by delta = (pressF + 1) - press_a; the roll stays the A-down frame + the measured roll_minus_press.
  function gen1Timeline(D, methId, offset, anchor, extraS) {
    var e = sceneEntry(D, methId), ev = e.events, fps = fpsOf(D.scenes.fps_expression);
    var m2t = D.gen1.menu_to_table_frames;
    // The menu anchor's t = 0 is the box a person can SEE (menu_visible), not the harness's detector frame
    // (menu_open). They are 46 to 53 frames apart on Red, Blue and Yellow, and the protocol asks the runner to
    // start the cue the instant the menu appears - so anchoring the timeline on the detector drew every event
    // three quarters of a second from where the runner would experience it, and disagreed with the cue by the
    // same amount. Gen 2's timeline has always anchored on its visible box (gen2Timeline, menu_visible); this
    // one was written first, before the two frames were known to differ.
    var originF = anchor === 'menu' ? ev.menu_visible : 0;
    var x = mk(fps, originF, anchor === 'reset' ? (extraS || 0) : 0);
    var pressF = ev.menu_open + m2t + offset;
    var delta = pressF + 1 - ev.press_a;
    var tl = base('gen1', fps, anchor === 'menu' ? 'the NEW GAME box being drawn (frame ' + ev.menu_visible + ', ' + (ev.menu_visible - ev.menu_open) + ' frames after the detector)' : anchor === 'reset' ? 'the reset press (fade + stall added)' : 'power-on');
    tl.methodologyId = methId; tl.offset = offset; tl.offsetUsed = ev.offset_used; tl.anchor = anchor;
    e.scenes.forEach(function (s) {
      var sF = s.start, eF = s.end;
      if (s.id === 'newgame') { sF += delta; eF += delta; }
      else if (s.id === 'menu') eF += delta;
      tl.segments.push({ id: s.id, label: s.label, t0: x(sF), t1: x(eF), skipped: !!s.skipped, f0: sF, f1: eF });
    });
    tl.events.push({ t: x(ev.hold_lo), t1: x(ev.hold_hi), kind: 'hold', label: 'START must go down in this window (frames ' + ev.hold_lo + '-' + ev.hold_hi + ')' });
    if (typeof ev.flash_visible_start === 'number') tl.events.push({ t: x(ev.flash_visible_start), t1: x(ev.flash_last_white + 1), kind: 'flash', label: 'white flash (visible ' + ev.flash_visible_start + '-' + ev.flash_last_white + ')' });
    tl.events.push({ t: x(ev.menu_open), kind: 'menu', label: 'menu detector (frame ' + ev.menu_open + '): nothing is on screen yet' });
    tl.events.push({ t: x(ev.menu_visible), kind: 'menu-visible', label: 'NEW GAME box drawn (frame ' + ev.menu_visible + '): this is what you anchor on' });
    tl.events.push({ t: x(pressF), kind: 'press', label: 'press A: the cue\'s A tone (frame ' + pressF + ' = menu_open + ' + m2t + ' + ' + offset + ', the engine\'s press frame; the trace reads A down on the next frame)' });
    tl.events.push({ t: x(ev.roll + delta), kind: 'roll', label: 'Trainer ID rolled (A-down frame + ' + ev.roll_minus_press + ' frames, measured at offset ' + ev.offset_used + ')' });
    tl.inputs.push({ t0: x(ev.hold_lo), t1: x(ev.start_release), text: 'HOLD START', cls: 'blue', kind: 'hold' });
    tl.inputs.push({ t0: x(pressF), t1: x(pressF + (ev.press_a_release - ev.press_a)), text: 'A', cls: 'green', kind: 'press' });
    tl.press = { t: x(pressF), frame: pressF, tracedADownFrame: pressF + 1 }; tl.roll = { t: x(ev.roll + delta), frame: ev.roll + delta };
    tl.visibleLagFrames = ev.menu_visible - ev.menu_open;
    tl.visibleLagS = (ev.menu_visible - ev.menu_open) / fps;
    tl.notes.push('Press convention: the marker, the A band and the cue\'s A tone all sit on the engine\'s press frame menu_open + ' + m2t + ' + offset (harness index ' + pressF + '); the trace\'s first A-down frame is the next index (' + (pressF + 1) + ').');
    tl.notes.push('The menu detector fires ' + tl.visibleLagFrames + ' frames (' + tl.visibleLagS.toFixed(2) + ' s) before the NEW GAME box is drawn (scene-timelines menu_visible: the first non-blank frame after the detector). The table\'s offsets are counted from the detector; everything you are asked to do is counted from the box, because the box is what you can see.');
    tl.notes.push(D.scenes.frame_convention);
    if (ev.roll_minus_press_note) tl.notes.push(ev.roll_minus_press_note);
    tl.notes.push(D.scenes.status);
    return finalize(tl);
  }

  // ---- Gen 2 timed method: scene-timelines + the engine's bin arithmetic --------------------------
  // state: the RTC state whose table is in force (its roll slips place the roll); default days0, the traced boot's state
  function gen2Timeline(D, G2, methId, bin, anchor, extraS, state) {
    var e = sceneEntry(D, methId), ev = e.events, fps = fpsOf(D.scenes.fps_expression);
    var m = D.gen2.methodologies[methId];
    if (!m) fail('no gen2 methodology ' + methId);
    var look = G2.lookup(D.gen2, m.game_key, m.platform_key, state || 'days0', bin);
    var rule = G2.binRule(D.gen2, m.game_key);
    var tracedBin = G2.binOf(ev.offset_used, rule);
    var tracedAccept = G2.acceptFrame(m.timing, tracedBin);
    var delta = look.acceptFrame - tracedAccept;
    var originF = anchor === 'menu' ? ev.menu_visible : 0;
    var x = mk(fps, originF, anchor === 'reset' ? (extraS || 0) : 0);
    var tl = base('gen2', fps, anchor === 'menu' ? 'the NEW GAME / OPTION box (visible frame ' + ev.menu_visible + ')' : anchor === 'reset' ? 'the reset press (fade + stall added)' : 'power-on');
    tl.methodologyId = methId; tl.bin = bin; tl.offsetUsed = ev.offset_used; tl.anchor = anchor; tl.state = state || 'days0';
    e.scenes.forEach(function (s) {
      var sF = s.start, eF = s.end;
      if (s.id === 'newgame') { sF += delta; eF += delta; }
      else if (s.id === 'menu') eF += delta;
      tl.segments.push({ id: s.id, label: s.label, t0: x(sF), t1: x(eF), skipped: !!s.skipped, f0: sF, f1: eF });
    });
    tl.events.push({ t: x(ev.hold_lo), t1: x(ev.hold_hi), kind: 'hold', label: 'START must be down in this window (frames ' + ev.hold_lo + '-' + ev.hold_hi + ')' });
    if (typeof ev.skip_splash === 'number') tl.events.push({ t: x(ev.skip_splash), kind: 'skip', label: 'held START honoured on the splash (frame ' + ev.skip_splash + ')' });
    tl.events.push({ t: x(ev.menu_open), kind: 'menu', label: 'menu detector (frame ' + ev.menu_open + ')' });
    tl.events.push({ t: x(ev.menu_visible), kind: 'menu-visible', label: 'box visible (frame ' + ev.menu_visible + '): release START' });
    tl.events.push({ t: x(look.pressFrames[0]), t1: x(look.pressFrames[1] + 1), kind: 'press', label: 'A-down frames of bin ' + bin + ' (' + look.pressFrames[0] + '-' + look.pressFrames[1] + ')' });
    tl.events.push({ t: x(look.acceptFrame), kind: 'accept', label: 'the poll that accepts the tap (frame ' + look.acceptFrame + ')' });
    tl.events.push({ t: x(look.rollFrame), kind: 'roll', label: 'IDs rolled (frame ' + look.rollFrame + ')' });
    tl.inputs.push({ t0: x(ev.hold_lo), t1: x(ev.start_release), text: 'HOLD START', cls: 'blue', kind: 'hold' });
    tl.inputs.push({ t0: x(look.pressFrames[0]), t1: x(look.pressFrames[1] + 1), text: 'tap A', cls: 'green', kind: 'press' });
    tl.press = { t: x(look.pressFrames[0]), t1: x(look.pressFrames[1] + 1), frames: look.pressFrames.slice() };
    tl.roll = { t: x(look.rollFrame), frame: look.rollFrame };
    tl.notes.push(D.scenes.frame_convention);
    if (ev.roll_minus_press_note) tl.notes.push(ev.roll_minus_press_note);
    tl.notes.push(D.scenes.status);
    return finalize(tl);
  }

  // ---- Gen 1 buffer guide: the composed steps, anchored on the Nintendo logo ----------------------
  // entry: {seq, s, v, win} from buffer-decode.js. The scenes before the Game Freak routine (boot logo, copyright) come
  // from scene-timelines for the same game and boot ROM (buffer platform gbp = the gba family, dmg = dmg), clipped at the
  // buffer model's gamefreak entry; from there every segment is a composed step. List-only rows (v = 'l') have no measured
  // title windows: composeTimeline throws for them and the caller shows the steps without a timeline.
  // SECONDS: harness steps order the timeline and give every frame number, but a step ends early at every LCD on/off
  // (windows.note), so step / fps runs ahead of the emulator's clock. Where the data carries seconds they are used: each
  // non-title action's reg_s (scene entry -> the registering poll) and next_s (that poll, or the scene entry for a
  // skip-only action, -> the next scene's entry), and roll_delay_s (the NEW GAME poll -> the roll). Two stretches have NO
  // seconds in the data and stay step / fps: power-on to the Game Freak entry (game_start_frame + gamefreak_start) and the
  // title screens (per-entry reg / exit steps, no seconds). The composed roll is compared with the entry's own s
  // (centiseconds from power-on to the roll): tl.rollResidualS = s / 100 - composed, shown beside the storyboard.
  function bufferTimeline(D, BD, game, platform, entry) {
    var bf = D.buffer, plat = bf.platforms[platform];
    if (!plat) fail('no buffer platform ' + platform);
    var wm = bf.windows.games[game] && bf.windows.games[game][platform];
    if (!wm) fail('no windows model for ' + game + '/' + platform);
    if (typeof wm.roll_delay_s !== 'number') fail('windows model ' + game + '/' + platform + ' has no roll_delay_s');
    var fps = fpsOf(D.gen1.fps_expression);
    var composed = BD.composeTimeline(wm, plat.game_start_frame, entry.seq, entry.win);
    var originF = plat.nintendo_logo_frame, originS = originF / fps;
    var xf = function (f) { return f / fps - originS; };   // a harness step index -> seconds from the anchor (stretches with no seconds in the data)
    var xs = function (s) { return s - originS; };         // seconds from power-on -> seconds from the anchor
    var tl = base('buffer', fps, 'the Nintendo logo appearing (frame ' + originF + ')');
    tl.game = game; tl.platform = platform; tl.seq = entry.seq;
    var gfEntry = plat.game_start_frame + wm.gamefreak_start;
    var family = platform === 'gbp' ? 'gba' : 'dmg';
    var methId = game + '/' + family + '/hold-start-v1';
    var pre = D.scenes.methodologies[methId];
    if (pre) pre.scenes.forEach(function (s) {
      if (s.start >= gfEntry) return;
      var eF = Math.min(s.end, gfEntry);
      tl.segments.push({ id: s.id, label: s.label, t0: xf(s.start), t1: xf(eF), f0: s.start, f1: eF, source: 'scene-timelines ' + methId });
    });
    // a press window: from the frame after the previous registered poll (the windows note: gap 0 = "the window opens before
    // the scene, at the previous action's registered poll + 1: no poll lies in between"; composeTimeline reports that as
    // gap == scene_start) or from the scene's own gap, to the poll where the press registers (reg)
    var steps = composed.steps, prevReg = plat.game_start_frame - 1, prevRegS = prevReg / fps, sceneS = gfEntry / fps;
    steps.forEach(function (st, i) {
      if (st.action === 'boot') {
        var bw = bf.windows.boot[platform] && bf.windows.boot[platform][st.token];
        bootBands(st.token, bw).forEach(function (bb) {
          tl.inputs.push({ t0: xf(bb.from), t1: xf(bb.to), text: bb.text, cls: bb.act === 'nothing' ? 'grey' : 'amber', kind: 'boot', act: bb.act, token: st.token, step: i, openF: bb.from, regF: bb.to - 1 });
        });
        return;
      }
      var next = st.next_start, e = st.scene === 'title' ? null : wm.scenes[st.scene][st.action], regS = null, nextS, from;
      if (!e) { // title: steps only
        regS = sceneS + (st.reg - st.scene_start) / fps; nextS = sceneS + (next - st.scene_start) / fps; from = 'steps';
      } else if (e.reg !== undefined) {
        if (typeof e.reg_s !== 'number' || typeof e.next_s !== 'number') fail('windows model ' + game + '/' + platform + ' ' + st.scene + '/' + st.action + ' has no reg_s / next_s');
        regS = sceneS + e.reg_s; nextS = regS + e.next_s; from = 'data';
      } else {
        if (typeof e.next_s !== 'number') fail('windows model ' + game + '/' + platform + ' ' + st.scene + '/' + st.action + ' has no next_s');
        nextS = sceneS + e.next_s; from = 'data';
      }
      tl.segments.push({ id: st.scene, label: st.scene + ' (' + st.token + ')', t0: xs(sceneS), t1: xs(nextS), f0: st.scene_start, f1: next, step: i, token: st.token, secondsFrom: from });
      if (st.reg !== undefined) {
        var opensBefore = st.gap === st.scene_start, open = opensBefore ? prevReg + 1 : st.gap;
        var openS = opensBefore ? prevRegS + 1 / fps : regS - (st.reg - st.gap) / fps;
        tl.inputs.push({ t0: xs(openS), t1: xs(regS + 1 / fps), text: st.token, cls: /reset|usb/.test(st.token) ? 'red' : 'green', kind: 'window', step: i, regT: xs(regS), openF: open, regF: st.reg });
        tl.events.push({ t: xs(regS), kind: 'reg', label: 'step ' + (i + 1) + ' ' + st.token + ' registers (step ' + st.reg + ')' });
        prevReg = st.reg; prevRegS = regS;
      } else if (st.run) {
        var r0 = sceneS + (st.run[0] - st.scene_start) / fps, r1 = sceneS + (st.run[1] - st.scene_start) / fps;
        tl.inputs.push({ t0: xs(r0), t1: xs(r1 + 1 / fps), text: 'touch nothing (' + st.token + ')', cls: 'grey', kind: 'run', step: i, openF: st.run[0], regF: st.run[1] });
        prevReg = st.run[1]; prevRegS = r1;
      }
      if (st.roll !== undefined) {
        var rollS = regS + wm.roll_delay_s;
        tl.segments.push({ id: 'roll', label: 'Oak\'s speech: Trainer ID rolled', t0: xs(rollS), t1: xs(rollS + wm.roll_delay_s), f0: st.roll, f1: st.roll + wm.roll_delay });
        tl.events.push({ t: xs(rollS), kind: 'roll', label: 'Trainer ID rolled (step ' + st.roll + ' = newgame + ' + wm.roll_delay + '; ' + wm.roll_delay_s + ' s after the NEW GAME poll, the data\'s roll_delay_s)' });
        tl.roll = { t: xs(rollS), frame: st.roll, seconds: rollS, newgameSeconds: regS };
      }
      sceneS = nextS;
    });
    tl.steps = steps; tl.newgameFrame = composed.newgame; tl.rollFrame = composed.roll;
    tl.entrySeconds = entry.s / 100;
    tl.rollSeconds = tl.roll ? tl.roll.seconds : null;
    tl.rollResidualS = tl.roll ? tl.entrySeconds - tl.roll.seconds : null;
    if (tl.roll) {
      var ms = Math.round(Math.abs(tl.rollResidualS) * 1000);
      tl.summary = 'Composed roll ' + tl.roll.seconds.toFixed(3) + ' s from power-on; this entry\'s own measured roll time (s) is ' + tl.entrySeconds.toFixed(2) + ' s: the composed clock is ' + ms + ' ms ' + (tl.rollResidualS < 0 ? 'late' : 'early') + ' by the roll (s is in centiseconds; not applied to the cues). ' +
        'The data carries seconds only for the actions after the Game Freak entry (reg_s / next_s, spread <= ' + wm.time_spread_ms_max + ' ms) and for the roll delay; power-on to the Game Freak entry and each title screen are harness steps, which run ahead of real frames at every LCD on/off (windows.note).';
    }
    tl.notes.push(bf.frame_convention);
    tl.notes.push(bf.windows.note);
    return finalize(tl);
  }
  // A boot (palette) token is not always ONE action. pal(ab) is two - a direction held from power-on, and an
  // A or B press inside a fifteen-frame window in the middle of it - and this used to return a single band
  // spanning the direction hold, so the screen showed a two-and-a-half second bar for a press the data gives
  // 70-85 (251 ms) for, and the cue had nothing precise to sound on. Each band now says which ACT it is, so a
  // caller can cue the ones that are timed and leave alone the ones that are not:
  //   'nothing' touch nothing in this span   'hold' put it down and keep it there   'press' a timed press
  //   'release' let go inside this span
  // Frames are boot frames after power-on, the units gen1-buffer.json's windows.boot block is written in.
  function bootBands(token, bw) {
    if (!bw) return [];
    var out = [];
    if (bw.no_input) return [{ from: bw.no_input[0], to: bw.no_input[1] + 1, act: 'nothing', text: token }];
    if (bw.direction_down_by != null || bw.direction_from != null) {
      // three different fields can end the direction band and they mean different things: hold_through and
      // direction_through are "still down at this frame", direction_down_by is only a deadline for putting it
      // down (pal releases it again inside its own window), so the band is named after the field that ended it.
      var through = bw.hold_through != null ? bw.hold_through : bw.direction_through, why = 'direction held';
      if (through == null) { through = bw.direction_down_by; why = 'direction down by frame ' + bw.direction_down_by; }
      out.push({ from: bw.direction_from == null ? 0 : bw.direction_from, to: through + 1, act: 'hold', text: token + ': ' + why });
    }
    if (bw.release_between) out.push({ from: bw.release_between[0], to: bw.release_between[1] + 1, act: 'release', text: token + ': let go' });
    if (bw.a_or_b_down_between) out.push({ from: bw.a_or_b_down_between[0], to: bw.a_or_b_down_between[1] + 1, act: 'press', text: token + ': A or B' });
    if (bw.a_or_b_press_between) out.push({ from: bw.a_or_b_press_between[0], to: bw.a_or_b_press_between[1] + 1, act: 'press', text: token + ': A or B, then keep both held' });
    if (!out.length && bw.hold_through != null) out.push({ from: 0, to: bw.hold_through + 1, act: 'hold', text: token });
    return out;
  }

  // ---- Gen 2 prescribed sequence: a COMPOSED route, not a traced boot ------------------------------
  // There is no single trace behind a psr route. It is a plateau's START hold, `pre` buffered backouts, a
  // measured wait, an optional OPTION step, `post` more backouts, and the NEW GAME press held out - so the
  // timeline is composed the way the Gen 1 buffer guide's is, from the data's own measured step costs, in the
  // order gen2-psr.json's `steps` list gives them. Every span below is one of those constants:
  //   step_frames.backout            109  detector to detector, constant across all sixteen plateaus
  //   step_frames.option             94   the whole OPTION step, over 288,000 rows
  //   step_frames.ng_press_after_menu 1   the NEW GAME press after the menu it returns to
  //   backout_b_frames               16   B down, then START this many frames later
  //   option_down_to_a_frames        8    DOWN, then A this many frames later
  //   accept_to_roll_frames          14   the accepting poll to the roll
  // Nothing is measured here and nothing is invented; where the data says the composition runs a frame or two
  // out (the 0.06% of buffered steps that run long) its own note is carried into the timeline's notes.
  //
  // ANCHOR: t = 0 is the menu box VISIBLE - the instant the runner taps Run, and the instant the cue is built
  // from. The route's wait W is counted from the menu DETECTOR, which fires visible_menu_lag_frames earlier.
  // The timed press is not recomputed here: the caller passes the second the cue sounds it, so the marker on
  // the canvas and the tone in the ear cannot drift apart.
  function gen2PsrTimeline(D, r, opts) {
    var o = opts || {};
    if (typeof o.pressSeconds !== 'number' || !isFinite(o.pressSeconds)) fail('gen2PsrTimeline needs the cue\'s press second, so the marker and the tone stay the same instant');
    var m = r.methodology;
    if (!m || !m.step_frames) fail('this psr methodology carries no step_frames, so no route can be composed');
    var fps = fpsOf(D.gen2psr.fps_expression), sf = m.step_frames;
    var lag = (D.gen2 && D.gen2.visible_menu_lag_frames) || 0;
    var bo = sf.backout, op = sf.option, ngAfter = sf.ng_press_after_menu;
    var bB = m.backout_b_frames, oA = m.option_down_to_a_frames, toRoll = m.accept_to_roll_frames;
    var x = function (f) { return f / fps; };                 // frames from the visible box -> seconds
    var tl = base('gen2psr', fps, 'the main menu box appearing (the box, not the detector ' + lag + ' frames before it)');
    tl.route = { tid: r.tid, lid: r.lid, plateau: r.plateauIndex, pre: r.pre, opt: !!r.opt, post: r.post, waitFrames: r.waitFrames };

    var menuDetF = -lag;                                      // the detector of the menu the wait is counted from
    var firstMenuDetF = menuDetF - r.pre * bo;                // before the pre-backouts
    var powerOnF = firstMenuDetF - r.plateau.menu_frame;      // menu_frame is power-on -> that detector
    var pressF = o.pressSeconds * fps;

    tl.segments.push({ id: 'power_on', label: 'power-on, START held to the main menu (plateau ' + r.plateauIndex + ')', t0: x(powerOnF), t1: x(firstMenuDetF), f0: 0, f1: r.plateau.menu_frame });
    tl.events.push({ t: x(powerOnF + r.plateau.hold_lo_frame), t1: x(powerOnF + r.plateau.hold_hi_frame), kind: 'hold', label: 'START must go down in this plateau (frames ' + r.plateau.hold_lo_frame + '-' + r.plateau.hold_hi_frame + ' from power-on)' });
    tl.inputs.push({ t0: x(powerOnF + r.plateau.hold_lo_frame), t1: x(firstMenuDetF), text: 'HOLD START', cls: 'blue', kind: 'hold' });

    // each backout: B at the menu, START backout_b_frames later, the title replaying in between
    function backout(startF, n) {
      tl.segments.push({ id: 'title', label: 'backout ' + n + ': the title screen replays', t0: x(startF), t1: x(startF + bo) });
      tl.inputs.push({ t0: x(startF), t1: x(startF + 1), text: 'B', cls: 'amber', kind: 'press' });
      tl.inputs.push({ t0: x(startF + bB), t1: x(startF + bo), text: 'HOLD START', cls: 'blue', kind: 'hold' });
      tl.events.push({ t: x(startF + bB), kind: 'press', label: 'backout ' + n + ': START goes down ' + bB + ' frames after B (anywhere in ' + m.backout_b_tolerance[0] + '-' + m.backout_b_tolerance[1] + ', but not once the title has finished appearing)' });
      return startF + bo;
    }
    var at = firstMenuDetF, k;
    for (k = 0; k < r.pre; k++) at = backout(at, k + 1);
    tl.segments.push({ id: 'menu', label: 'the main menu: wait ' + r.waitFrames + ' frames from the detector (' + (r.waitFrames - lag) + ' from the box you can see)', t0: x(menuDetF), t1: x(pressF) });
    tl.events.push({ t: 0, kind: 'menu', label: 'the NEW GAME / OPTION box is drawn: this is the anchor' });

    var endBtn = o.endButton || (r.opt ? 'DOWN' : (r.post > 0 ? 'B' : 'A'));
    tl.events.push({ t: x(pressF), kind: 'press', label: 'the timed press: ' + endBtn + (o.endWhat ? ' - ' + o.endWhat : '') + ' (the cue\'s tone)' });
    tl.inputs.push({ t0: x(pressF), t1: x(pressF + 1), text: endBtn, cls: 'green', kind: 'press' });
    tl.press = { t: x(pressF), frame: pressF, button: endBtn };

    var lastMenuDetF;
    if (r.opt) {
      tl.segments.push({ id: 'option', label: 'the OPTION screen, then START back to the menu', t0: x(pressF), t1: x(pressF + op) });
      tl.inputs.push({ t0: x(pressF + oA), t1: x(pressF + oA + 1), text: 'A', cls: 'green', kind: 'press' });
      tl.events.push({ t: x(pressF + oA), kind: 'press', label: 'A goes down ' + oA + ' frames after DOWN (window ' + m.option_down_to_a_tolerance[0] + '-' + m.option_down_to_a_tolerance[1] + ')' });
      lastMenuDetF = pressF + op;
      for (k = 0; k < r.post; k++) lastMenuDetF = backout(lastMenuDetF, r.pre + k + 1);
    } else if (r.post > 0) {
      lastMenuDetF = backout(pressF, r.pre + 1);              // the timed press IS this backout's B
      for (k = 1; k < r.post; k++) lastMenuDetF = backout(lastMenuDetF, r.pre + k + 1);
    } else {
      lastMenuDetF = null;                                    // the timed press IS the held NEW GAME press
    }

    var ngF = lastMenuDetF === null ? pressF : lastMenuDetF + ngAfter;
    if (lastMenuDetF !== null) {
      tl.segments.push({ id: 'menu', label: 'back at the main menu', t0: x(lastMenuDetF), t1: x(ngF) });
      tl.inputs.push({ t0: x(ngF), t1: x(ngF + toRoll), text: 'HOLD A', cls: 'green', kind: 'press' });
      tl.events.push({ t: x(ngF), kind: 'press', label: 'A on NEW GAME, HELD (' + ngAfter + ' frame after the menu returns)' });
    } else {
      tl.inputs.push({ t0: x(ngF), t1: x(ngF + toRoll), text: 'HOLD A', cls: 'green', kind: 'press' });
    }
    var rollF = ngF + toRoll;
    tl.segments.push({ id: 'newgame', label: 'NEW GAME: A is still held', t0: x(ngF), t1: x(rollF) });
    tl.segments.push({ id: 'roll', label: 'the IDs are rolled', t0: x(rollF), t1: x(rollF + 60) });
    tl.events.push({ t: x(rollF), kind: 'roll', label: 'Trainer ID ' + r.tid + ' and Lucky ID ' + r.lid + ' are rolled (' + toRoll + ' frames after the accepting poll)' });
    tl.roll = { t: x(rollF), frame: rollF };

    tl.notes.push('Composed from the data\'s measured step costs, not from one traced boot: backout ' + bo + ' frames, OPTION ' + op + ', NEW GAME ' + ngAfter + ' frame after the menu, roll ' + toRoll + ' after the accepting poll.');
    if (sf.note) tl.notes.push(sf.note);
    tl.notes.push(D.gen2psr.frame_convention);
    return finalize(tl);
  }

  // ---- Ruby / Sapphire: the copyright anchor, the wait, the press, the write --------------------------
  function rsTimeline(D, game, P, pMin) {
    var g = D.gen3rs.games[game];
    if (!g) fail('no gen3-rs game ' + game);
    var a = g.model.anchor, fps = fpsOf(D.gen3rs.gba_fps_expression);
    // t = 0 is the frame the copyright text is FULLY DRAWN, not the first frame with a non-white pixel. The
    // data defines first_game_frame_to_copyright_visible as one step of a sixteen-step palette fade out of
    // white - a frame-differ's threshold, and by the data's own note not yet readable - while
    // ..._text_fully_visible is the one stated as something a person can check. They are 17 frames, 284.6 ms,
    // apart on a target where one frame is a different Trainer ID. The cue was moved to the readable frame
    // because that is what the instruction had always named; this origin follows it, so the storyboard and the
    // cue still mark the same instant, exactly as gen1Timeline was moved to menu_visible.
    var originF = a.first_game_frame_to_copyright_text_fully_visible;
    var fadeF = a.first_game_frame_to_copyright_visible;
    var x = mk(fps, originF, 0);
    var tl = base('rs', fps, 'the copyright text fully drawn (frame ' + originF + ' after the first frame of game code; the fade out of white starts ' + (originF - fadeF) + ' frames earlier, on frame ' + fadeF + ')');
    tl.game = game; tl.P = P; tl.pMin = pMin;
    tl.segments.push({ id: 'white', label: 'white (frames 0-' + (fadeF - 1) + ', before the fade)', t0: x(0), t1: x(fadeF), f0: 0, f1: fadeF });
    tl.segments.push({ id: 'copyright-fade', label: 'copyright fading in', t0: x(fadeF), t1: x(originF), f0: fadeF, f1: originF });
    tl.segments.push({ id: 'copyright', label: 'copyright text', t0: x(a.first_game_frame_to_copyright_text_fully_visible), t1: x(a.first_game_frame_to_copyright_fade_to_black_begins), f0: a.first_game_frame_to_copyright_text_fully_visible, f1: a.first_game_frame_to_copyright_fade_to_black_begins });
    tl.segments.push({ id: 'fade-black', label: 'fade to black', t0: x(a.first_game_frame_to_copyright_fade_to_black_begins), t1: x(a.first_game_frame_to_black_after_copyright), f0: a.first_game_frame_to_copyright_fade_to_black_begins, f1: a.first_game_frame_to_black_after_copyright });
    tl.segments.push({ id: 'opening', label: 'the opening (intro, title, NEW GAME, Birch, the name): play it through', t0: x(a.first_game_frame_to_black_after_copyright), t1: x(pMin), f0: a.first_game_frame_to_black_after_copyright, f1: pMin });
    tl.segments.push({ id: 'lastbox', label: 'the last page of Birch\'s last box: wait for the cue', t0: x(pMin), t1: x(P), f0: pMin, f1: P });
    tl.segments.push({ id: 'write', label: 'the fade: IDs written ' + g.model.press_to_write_frames + ' frames after the press', t0: x(P), t1: x(P + g.model.press_to_write_frames), f0: P, f1: P + g.model.press_to_write_frames });
    tl.events.push({ t: x(pMin), kind: 'pmin', label: 'earliest accepting frame P_min = ' + pMin });
    tl.events.push({ t: x(P), kind: 'press', label: 'A read on frame P = ' + P });
    tl.events.push({ t: x(P + g.model.press_to_write_frames), kind: 'roll', label: 'Trainer ID / Secret ID written (frame ' + (P + g.model.press_to_write_frames) + ')' });
    tl.inputs.push({ t0: x(P), t1: x(P + 2), text: 'A', cls: 'green', kind: 'press' });
    tl.press = { t: x(P), frame: P };
    tl.notes.push(D.gen3rs.frame_convention);
    tl.notes.push(a.notes);
    return finalize(tl);
  }

  function segmentAt(tl, t) {
    var seg = null;
    for (var i = 0; i < tl.segments.length; i++) { var s = tl.segments[i]; if (t >= s.t0 && t < s.t1 && !s.skipped) seg = s; }
    return seg;
  }
  function inputsAt(tl, t) { return tl.inputs.filter(function (b) { return t >= b.t0 && t < b.t1; }); }

  // ---- drawing: schematic scenes on a 160x144 logical screen ------------------------------------------
  var GB = { w: 160, h: 144 };
  var COLORS = { white: '#e8f0d8', light: '#a8c088', dark: '#587048', black: '#203020', gba: { white: '#f4f4f4', light: '#c8d0e0', dark: '#5060a0', black: '#101828' } };
  var SEG_COLORS = { power_on: '#333', boot_logo: '#8892b0', blank: '#2a2a2a', copyright: '#c0c0c0', gamefreak: '#7c5cff', intro: '#ff8a65', flash: '#ffffff', title: '#ffd54f', menu: '#4dd0e1', newgame: '#66bb6a', roll: '#66bb6a', option: '#26a69a', clearsave: '#ef5350', oak: '#8d6e63', boot: '#8892b0', white: '#f4f4f4', 'copyright-fade': '#d0d0d0', 'fade-black': '#606060', opening: '#7986cb', lastbox: '#ffb74d', write: '#66bb6a' };
  function pal(tl) { return tl.kind === 'rs' ? COLORS.gba : COLORS; }
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function text(c, s, x, y, col, size, align) { c.fillStyle = col; c.font = 'bold ' + (size || 9) + 'px ui-monospace, Menlo, monospace'; c.textAlign = align || 'left'; c.textBaseline = 'top'; c.fillText(s, x, y); }
  function box(c, x, y, w, h, P) { rect(c, x, y, w, h, P.white); c.strokeStyle = P.black; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  function silhouette(c, cx, cy, r, col, flip) { c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy, r, r * 1.15, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(cx + (flip ? -r * 0.5 : r * 0.5), cy - r * 0.9, r * 0.45, r * 0.7, flip ? 0.4 : -0.4, 0, Math.PI * 2); c.fill(); }
  function paintScene(c, tl, seg, t, gameName) {
    var P = pal(tl), prog = seg ? Math.max(0, Math.min(1, (t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0))) : 0;
    var id = seg ? seg.id : 'power_on';
    rect(c, 0, 0, GB.w, GB.h, P.black);
    if (id === 'power_on' || id === 'blank' || id === 'fade-black') {
      rect(c, 0, 0, GB.w, GB.h, id === 'fade-black' ? P.dark : P.black);
      if (id === 'blank') text(c, 'blank', 80, 66, P.dark, 9, 'center');
    } else if (id === 'boot_logo' || id === 'boot') {
      rect(c, 0, 0, GB.w, GB.h, P.white);
      var y = tl.kind === 'gen1' || tl.kind === 'buffer' || tl.kind === 'gen2' ? -20 + Math.min(1, prog * 1.6) * 80 : 60;
      box(c, 34, y, 92, 26, P); text(c, 'Nintendo', 80, y + 8, P.black, 12, 'center');
      text(c, 'boot ROM logo', 80, 120, P.dark, 8, 'center');
    } else if (id === 'copyright' || id === 'copyright-fade' || id === 'white') {
      var w = id === 'white' || (id === 'copyright-fade' && prog < 0.5) ? 1 : 0;
      rect(c, 0, 0, GB.w, GB.h, P.white);
      if (!w) { c.globalAlpha = id === 'copyright-fade' ? prog : 1; text(c, '(c) copyright', 80, 50, P.black, 10, 'center'); text(c, 'GAME FREAK inc.', 80, 66, P.black, 9, 'center'); text(c, 'Nintendo / Creatures', 80, 80, P.black, 8, 'center'); c.globalAlpha = 1; }
    } else if (id === 'gamefreak') {
      rect(c, 0, 0, GB.w, GB.h, P.black);
      rect(c, 0, 44, GB.w, 56, P.white);
      text(c, 'GAME FREAK', 80, 56, P.black, 12, 'center'); text(c, 'presents', 80, 74, P.dark, 9, 'center');
      var sx = 150 - prog * 140, sy = 10 + prog * 30;
      c.fillStyle = '#ffe082'; c.beginPath(); for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / 5; c.lineTo(sx + 6 * Math.cos(a), sy + 6 * Math.sin(a)); var b = a + Math.PI / 5; c.lineTo(sx + 2.5 * Math.cos(b), sy + 2.5 * Math.sin(b)); } c.closePath(); c.fill();
    } else if (id === 'intro') {
      rect(c, 0, 0, GB.w, GB.h, P.white);
      rect(c, 0, 112, GB.w, 32, P.light);
      var hop = Math.abs(Math.sin(prog * 40)) * 10;
      if (/yellow/.test(gameName || '')) { silhouette(c, 80, 84 - hop, 20, P.dark, false); text(c, 'Pikachu intro', 80, 4, P.dark, 8, 'center'); }
      else { silhouette(c, 44, 86 - hop, 20, P.dark, true); silhouette(c, 116, 86, 20, P.black, false); text(c, 'Gengar vs Nidorino', 80, 4, P.dark, 8, 'center'); }
    } else if (id === 'flash') {
      rect(c, 0, 0, GB.w, GB.h, '#ffffff');
    } else if (id === 'title') {
      rect(c, 0, 0, GB.w, GB.h, P.white);
      box(c, 10, 14, 140, 40, P); text(c, 'Pokemon', 80, 20, P.black, 13, 'center'); text(c, (gameName || 'game').toUpperCase() + ' VERSION', 80, 38, P.dark, 9, 'center');
      silhouette(c, 40, 100, 18, P.dark, false); silhouette(c, 116, 100, 16, P.light, true);
      text(c, tl.kind === 'gen2' ? 'title (START held)' : 'title screen', 80, 128, P.dark, 8, 'center');
    } else if (id === 'menu' || id === 'newgame' || id === 'option' || id === 'clearsave' || id === 'oak' || id === 'roll') {
      rect(c, 0, 0, GB.w, GB.h, P.white);
      if (id === 'menu') { box(c, 8, 8, 120, 52, P); text(c, '> NEW GAME', 16, 16, P.black, 10); text(c, '  OPTION', 16, 34, P.black, 10); if (tl.kind === 'gen2') text(c, '(box visible)', 80, 128, P.dark, 8, 'center'); }
      else if (id === 'option') { box(c, 8, 8, 144, 80, P); text(c, 'OPTION', 16, 14, P.black, 10); text(c, 'TEXT SPEED  :FAST', 16, 32, P.black, 8); text(c, 'BATTLE ANIM :ON', 16, 46, P.black, 8); text(c, 'CANCEL', 16, 70, P.black, 8); }
      else if (id === 'clearsave') { box(c, 8, 96, 144, 40, P); text(c, 'Clear all saved data?', 16, 104, P.black, 8); text(c, 'YES  NO', 16, 118, P.black, 8); }
      else if (id === 'oak') { silhouette(c, 80, 70, 22, P.dark, false); box(c, 8, 100, 144, 36, P); text(c, 'Hello there!', 16, 108, P.black, 9); }
      else { rect(c, 0, 0, GB.w, GB.h, prog < 0.2 ? P.white : P.black); if (prog >= 0.2) text(c, 'NEW GAME accepted', 80, 60, P.light, 9, 'center'); }
    } else if (id === 'opening') {
      rect(c, 0, 0, GB.w, GB.h, P.white); silhouette(c, 80, 60, 20, P.dark, false); box(c, 8, 96, 144, 40, P); text(c, 'play through the', 16, 104, P.black, 8); text(c, 'opening (mash A)', 16, 118, P.black, 8);
    } else if (id === 'lastbox') {
      rect(c, 0, 0, GB.w, GB.h, P.white); silhouette(c, 80, 56, 20, P.dark, false); box(c, 8, 96, 144, 40, P); text(c, 'Come see me in my', 16, 104, P.black, 8); text(c, 'POKeMON LAB.   v', 16, 118, P.black, 8);
    } else if (id === 'write') {
      rect(c, 0, 0, GB.w, GB.h, '#ffffff'); text(c, 'IDs written', 80, 60, P.dark, 9, 'center');
    }
  }
  // draw(canvas, tl, t, opts): opts.overlay {text, cls} (the cue's flash), opts.gameName, opts.clockText
  function draw(canvas, tl, t, opts) {
    opts = opts || {};
    var c = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    // fitCanvas() gives the canvas a device-pixel backing store (width = css * dpr) and draw()
    // works in those backing pixels, so anything sized in fixed px shrinks by 1/dpr on screen:
    // 11px of chrome on a 3x phone arrives as under 4 css px. Every chrome measurement below is
    // therefore in design px against a 360-wide canvas and scaled through S(). The Game Boy art
    // is not touched - it is drawn under c.scale(scale) in real 160x144 screen pixels.
    var uiF = W / 360, S = function (n) { return Math.round(n * uiF); };
    var fBody = S(15), fTick = S(13);          // design px: was a fixed 11 and 10
    var chipH = S(21), labelRow = S(20);       // the rows those two have to fit inside
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0b0e12'; c.fillRect(0, 0, W, H);
    var pad = S(6), barH = S(29) + fTick + S(2);
    var screenH = H - barH - pad * 2 - (labelRow + chipH + S(12));
    var scale = Math.min((W - pad * 2) / GB.w, screenH / GB.h);
    var sx = (W - GB.w * scale) / 2, sy = pad;
    var seg = segmentAt(tl, t);
    c.save(); c.translate(sx, sy); c.scale(scale, scale);
    c.beginPath(); c.rect(0, 0, GB.w, GB.h); c.clip();
    paintScene(c, tl, seg, t, opts.gameName);
    c.restore();
    c.strokeStyle = '#3a4656'; c.lineWidth = S(2); c.strokeRect(sx - S(1), sy - S(1), GB.w * scale + S(2), GB.h * scale + S(2));
    // the cue's flash overlay over the screen
    var ov = opts.overlay;
    if (ov) {
      var cols = { 'v-white': '#ffffff', 'v-green': '#00c853', 'v-blue': '#2962ff', 'v-amber': '#ffb300', 'v-red': '#d50000' };
      c.globalAlpha = 0.82; c.fillStyle = cols[ov.cls] || '#ffffff'; c.fillRect(sx, sy, GB.w * scale, GB.h * scale); c.globalAlpha = 1;
      c.fillStyle = ov.cls === 'v-white' || ov.cls === 'v-amber' ? '#000' : '#fff'; c.font = 'bold ' + Math.round(Math.min(S(48), GB.w * scale / Math.max(3, ov.text.length) * 1.5)) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ov.text, sx + GB.w * scale / 2, sy + GB.h * scale / 2);
    }
    // scene label + clock
    c.font = fBody + 'px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#e8edf2';
    var label = seg ? seg.label : (t < tl.tMin ? 'before the timeline' : 'after the timeline');
    c.fillText(clip(c, label, W - pad * 2 - S(70)), pad, sy + GB.h * scale + S(4));
    c.textAlign = 'right'; c.fillStyle = '#93a1af'; c.fillText((opts.clockText || ('T' + (t >= 0 ? '+' : '') + t.toFixed(2) + ' s')), W - pad, sy + GB.h * scale + S(4));
    // input band
    var iy = sy + GB.h * scale + S(4) + labelRow;
    var act = inputsAt(tl, t);
    c.textAlign = 'left'; c.fillStyle = '#93a1af'; c.font = fBody + 'px system-ui, sans-serif';
    if (act.length) {
      var colsB = { blue: '#2962ff', green: '#00c853', amber: '#ffb300', red: '#d50000', grey: '#555' };
      var xx = pad;
      act.forEach(function (b) {
        var w = Math.min(W - pad - xx, c.measureText(b.text).width + S(14));
        c.fillStyle = colsB[b.cls] || '#555'; c.fillRect(xx, iy, w, chipH);
        c.fillStyle = b.cls === 'amber' ? '#000' : '#fff'; c.fillText(clip(c, b.text, w - S(8)), xx + S(6), iy + Math.round((chipH - fBody) / 2));
        xx += w + S(6);
      });
    } else c.fillText(t >= (tl.press ? tl.press.t : Infinity) ? 'hands off' : 'no input now', pad, iy + Math.round((chipH - fBody) / 2));
    // timeline bar
    var by = H - barH - pad, bw = W - pad * 2, span = Math.max(1e-6, tl.tMax - tl.tMin);
    var X = function (tt) { return pad + (tt - tl.tMin) / span * bw; };
    c.fillStyle = '#1a2027'; c.fillRect(pad, by, bw, S(14));
    tl.segments.forEach(function (s) { if (s.skipped) return; c.fillStyle = SEG_COLORS[s.id] || '#777'; c.fillRect(X(s.t0), by, Math.max(1, X(s.t1) - X(s.t0)), S(14)); });
    tl.inputs.forEach(function (b) { var colsB2 = { blue: '#2962ff', green: '#00c853', amber: '#ffb300', red: '#d50000', grey: '#666' }; c.fillStyle = colsB2[b.cls] || '#777'; c.fillRect(X(b.t0), by + S(16), Math.max(2, X(b.t1) - X(b.t0)), S(5)); });
    tl.events.forEach(function (e) {
      var col = e.kind === 'press' ? '#00c853' : e.kind === 'roll' ? '#66bb6a' : e.kind === 'hold' ? '#2962ff' : e.kind === 'flash' ? '#fff' : '#ffb300';
      if (e.t1 != null) { c.globalAlpha = 0.35; c.fillStyle = col; c.fillRect(X(e.t), by + S(22), Math.max(2, X(e.t1) - X(e.t)), S(4)); c.globalAlpha = 1; }
      else { c.fillStyle = col; c.fillRect(X(e.t) - S(1), by - S(3), S(2), S(20)); }
    });
    if (typeof opts.anchorT === 'number' && opts.anchorT >= tl.tMin && opts.anchorT <= tl.tMax) { c.fillStyle = '#fff'; c.fillRect(X(opts.anchorT) - S(1), by - S(6), S(2), S(26)); }
    var px = X(Math.max(tl.tMin, Math.min(tl.tMax, t)));
    c.fillStyle = '#f97316'; c.beginPath(); c.moveTo(px, by - S(8)); c.lineTo(px - S(5), by - S(14)); c.lineTo(px + S(5), by - S(14)); c.closePath(); c.fill(); c.fillRect(px - S(1), by - S(8), S(2), S(30));
    c.textAlign = 'left'; c.fillStyle = '#93a1af'; c.font = fTick + 'px system-ui, sans-serif'; c.fillText(tl.tMin.toFixed(1) + ' s', pad, by + S(29));
    c.textAlign = 'right'; c.fillText(tl.tMax.toFixed(1) + ' s', W - pad, by + S(29));
  }
  function clip(c, s, maxW) {
    if (c.measureText(s).width <= maxW) return s;
    while (s.length > 1 && c.measureText(s + '...').width > maxW) s = s.slice(0, -1);
    return s + '...';
  }

  return { fpsOf: fpsOf, scenesSeconds: scenesSeconds, gen1Timeline: gen1Timeline, gen2Timeline: gen2Timeline, bufferTimeline: bufferTimeline, rsTimeline: rsTimeline,
    bootBands: bootBands, gen2PsrTimeline: gen2PsrTimeline, segmentAt: segmentAt, inputsAt: inputsAt, draw: draw, SEG_COLORS: SEG_COLORS, GB: GB };
});
