// TID Helper page: Ruby / Sapphire with a dead battery (and the live-battery branch), from gen3-rs.json's own model:
// the boot seed S (0x5A0 when the battery is dead; fold(minute count) of the boot clock otherwise), the press frame P
// (0-based from the first frame of game code; the A that ends Birch's last page), n = P + steps_to_sid_minus_press_frame
// LCRNG steps to the Secret ID and one more to the Trainer ID. The LCRNG is ShinyCore's (rng.js); the data's lcrng block
// is checked against it at load. Every vector in the data replays through pair() in tests/tid-helper/rs.test.cjs, with a
// negative control. UMD: the engine runs under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('../../../../src/lib/shiny/rng.js'));
  else root.TidHelperGen3Rs = factory(root, root.ShinyCore);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root, core) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  function fpsOf(expr) { var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(expr)); if (!m) fail('gba_fps_expression is not a/b'); return Number(m[1]) / Number(m[2]); }
  // the data's LCRNG must be the engine's (mult / add / output), else nothing below is the data's model
  function checkLcrng(D) {
    var l = D.gen3rs.lcrng;
    if (parseInt(l.mult, 16) !== core.MULT || parseInt(l.add, 16) !== core.ADD || l.output !== 'hi16') fail('gen3-rs.json lcrng ' + JSON.stringify(l) + ' is not the engine\'s (' + core.MULT + ', ' + core.ADD + ', hi16)');
    return true;
  }
  function model(D, game) { var g = D.gen3rs.games[game]; if (!g) fail('no gen3-rs game ' + game); return g; }
  // (TID, SID) for seed S and press frame P: n = P + steps_to_sid_minus_press_frame steps to the SID word, one more to the TID
  function pair(D, game, S, P) {
    var g = model(D, game), n = P + g.model.steps_to_sid_minus_press_frame;
    if (!(Number.isInteger(P) && P >= 0)) fail('P must be a non-negative integer');
    var x = core.jump(S >>> 0, n), sid = x >>> 16;
    x = core.next(x);
    return { tid: x >>> 16, sid: sid, P: P, seed: S >>> 0, steps: n };
  }
  // every frame from pFrom to pTo: one LCRNG step per frame, so the whole table is one pass
  function table(D, game, S, pFrom, pTo) {
    var g = model(D, game), n0 = pFrom + g.model.steps_to_sid_minus_press_frame, out = [];
    var x = core.jump(S >>> 0, n0);
    for (var P = pFrom; P <= pTo; P++) {
      var sid = x >>> 16, y = core.next(x), tid = y >>> 16;
      out.push({ P: P, tid: tid, sid: sid });
      x = y;
    }
    return out;
  }
  function searchTid(D, game, S, tid, pFrom, pTo, limit) {
    var rows = table(D, game, S, pFrom, pTo), out = [];
    for (var i = 0; i < rows.length; i++) if (rows[i].tid === tid) { out.push(rows[i]); if (limit && out.length >= limit) break; }
    return out;
  }
  function vectorOk(D, game, v) { var r = pair(D, game, v.seed, v.press_frame); return r.tid === v.tid && r.sid === v.sid; }
  // the live-battery seed: the data's fold of the S3511 minute count (BCD hour / minute), ported from live_battery_seed.formula
  function rsSeed(y, m, d, hh, mm) {
    var leap = function (i) { return (i % 4 === 0 && i % 100 !== 0) || i % 400 === 0; };
    var dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var days = 0;
    for (var i = y - 2000 - 1; i > 0; i--) days += leap(i) ? 366 : 365;
    for (var j = 0; j < m - 1; j++) days += dim[j];
    if (m > 2 && leap(y - 2000)) days++;
    days += d;
    var bcd = function (v) { return ((v / 10) | 0) * 16 + v % 10; };
    var mc = 1440 * days + 60 * bcd(hh) + bcd(mm);
    return { dayCount: days, minuteCount: mc, seed: ((mc >>> 16) ^ (mc & 0xFFFF)) & 0xFFFF };
  }
  // WHICH INSTANT A PERSON IS ANCHORED ON. first_game_frame_to_copyright_visible is a frame-differ's threshold and not
  // a cue: the data defines frame 4 as the first frame with non-white pixels, one step of the sixteen-step palette fade
  // out of white (BeginNormalPaletteFade(0xFFFFFFFF, 0, 16, 0, FADE_COLOR_WHITE) in SetUpCopyrightScreen state 0), and
  // the same notes put the text only "faintly readable" three frames later and fully black-on-white at
  // first_game_frame_to_copyright_text_fully_visible. Of the three instants the data records, that last one is the only
  // one stated as a condition a person can check by eye ("fully black-on-white"), and it is the end of the fade, after
  // which nothing on screen changes until frame 148 - so it is what "the copyright screen appears" means, which is what
  // the page and the Run button have always asked for. The arithmetic is counted from it.
  // It used to be counted from the fade start under that same instruction: 17 frames, 284.6 ms, of systematic lateness,
  // on a target where P-1 and P+1 give different Trainer IDs. The correction can absorb a constant, but gen3-rs.json
  // supplies no default one (defaults.correction_ms is null), so the first attempt carried the whole of it, and once
  // calibrated the runner would have been shown 284.6 ms of screen fade labelled as their own reaction time.
  // Both frames come back together so the page can print the gap rather than quietly moving the number.
  function copyrightAnchor(D, game) {
    var a = model(D, game).model.anchor, fade = a.first_game_frame_to_copyright_visible, vis = a.first_game_frame_to_copyright_text_fully_visible;
    if (typeof fade !== 'number' || typeof vis !== 'number') fail('gen3-rs.json carries no copyright fade / fully-visible frame for ' + game + ', so there is no instant to anchor on');
    return { fadeFrame: fade, visibleFrame: vis, lagFrames: vis - fade, lagS: (vis - fade) / fps(D) };
  }
  function anchorFrame(D, game) { return copyrightAnchor(D, game).visibleFrame; }
  function fps(D) { return fpsOf(D.gen3rs.gba_fps_expression); }
  function pressSeconds(D, game, P) { return (P - anchorFrame(D, game)) / fps(D); }
  // the cue: count-in beeps then the long A tone at the press second (minus the correction), as ShinyGen1Tid builds them
  function cueProgram(G1, D, game, P, correctionMs, beeps, spacingS) {
    var tA = pressSeconds(D, game, P) - (correctionMs || 0) / 1000;
    if (tA <= 0) fail('the press would be due before the anchor (P ' + P + ', correction ' + correctionMs + ' ms)');
    var ci = G1.countInCues(tA, beeps == null ? 4 : beeps, spacingS == null ? 1.0 : spacingS, 0.5);
    var cues = ci.cues.slice();
    cues.push({ t: tA, freq: G1.A_CUE_TONE[0], ms: G1.A_CUE_TONE[1], label: 'A', kind: 'A' });
    return { cues: cues, tA: tA, dropped: ci.dropped };
  }
  // WHICH ENTRIES OF p_min_frames_notes ARE ACTUALLY A P_min. That block is a notes map, not an enumeration of
  // opening paths: besides the six press frames it carries "battery-dry box cost in frames (mash 8)" = 288, the
  // frames the battery-dry box adds (4351 - 4063 on Ruby, 4343 - 4055 on Sapphire), which is a difference between
  // two of the others and not a frame index at all. The selector rendered every key of the map as
  // "<key> -> P_min <value>", so picking that one set P_min = 288: a press 4.76 s after the copyright screen,
  // where the game is still in the intro, and a whole table and cue built on it.
  // The test is the data's own attestation. A P_min is a frame the data records a press on, so it appears as a
  // vectors[].press_frame or as a dead_battery_checks[].p_min; 288 appears as neither. No key text is matched, so
  // an entry the data later attests becomes an option by itself.
  function attestedPressFrames(D, game) {
    var g = model(D, game), seen = {};
    (g.vectors || []).forEach(function (v) { seen[v.press_frame] = true; });
    (g.dead_battery_checks || []).forEach(function (c) { if (c.p_min != null) seen[c.p_min] = true; });
    return seen;
  }
  function pMinOptions(D, game) {
    var notes = model(D, game).model.p_min_frames_notes, seen = attestedPressFrames(D, game), opts = [], other = [];
    Object.keys(notes).forEach(function (k) { (seen[notes[k]] ? opts : other).push({ key: k, frames: notes[k] }); });
    return { options: opts, notPressFrames: other };
  }
  // THE EARLIEST PRESSES AN OPENING PATH ALLOWS: what the page can put in front of a runner who has not named a
  // target yet. The length of the window is not a number chosen here. dead_battery_checks records each harness run
  // as pairs_P_min_to_plus5, the (P, TID, SID) triples from that run's P_min onward, and that block's own length is
  // the window. When one of those runs was made at this P_min and read back this seed, its triples are compared
  // against the model's output frame by frame and a row is marked attested only where the two agree - so the mark
  // says the data recorded that pair, not merely that some check exists for the path. A live battery or any other
  // seed matches no run, and then nothing is marked and the page says so.
  function headWindow(D, game, pMin, seed) {
    var checks = model(D, game).dead_battery_checks || [], hit = null, frames = 0;
    checks.forEach(function (c) {
      var pairs = c.pairs_P_min_to_plus5 || [];
      if (pairs.length > frames) frames = pairs.length;
      if (!hit && pairs.length && c.p_min === pMin && c.read_back === seed) hit = c;
    });
    return { check: hit, frames: frames };
  }
  function headRows(D, game, seed, pMin, pMax) {
    var w = headWindow(D, game, pMin, seed);
    // Every shipped game carries dead-battery checks, so this cannot fire on the current data - which is why an
    // empty window would otherwise pass unnoticed as a table with no rows and no stated reason.
    if (!w.frames) fail('gen3-rs.json records no dead-battery check for ' + game + ', so there is no attested window of earliest presses to offer');
    var last = pMin + w.frames - 1;
    if (typeof pMax === 'number' && pMax < last) last = pMax;
    var rows = table(D, game, seed, pMin, last), byP = {};
    ((w.check && w.check.pairs_P_min_to_plus5) || []).forEach(function (t) { byP[t[0]] = t; });
    rows.forEach(function (r) { var t = byP[r.P]; r.attested = !!(t && t[1] === r.tid && t[2] === r.sid); });
    return { rows: rows, check: w.check, frames: w.frames };
  }
  // The target sets this page may offer. It scores a candidate with the Gen 1 engine (makeTargetSet / setAccepts over
  // a Trainer ID), so it reads the blocks written in that vocabulary: the R/S data's own target_sets if it ever
  // defines one, then gen1-tid.json's. A set is kept only when its OWN `games` list names this game. gen1-tid.json's
  // block was rendered whole here, so Ruby and Sapphire were offered psr-64c2, bank16-family-inferred and
  // hi40-corruption (games ["red","blue"]) and psr-yellow (games ["yellow"]): Gen 1 route targets that mean nothing
  // on a Gen 3 cartridge. No game name is written below; the data's own `games` list decides.
  function targetSetsFor(D, game) {
    var out = [], seen = {};
    [D.gen3rs, D.gen1].forEach(function (blk) {
      var sets = blk && blk.target_sets;
      if (!sets) return;
      Object.keys(sets).forEach(function (k) {
        var spec = sets[k];
        if (seen[k] || !spec || (spec.games || []).indexOf(game) === -1) return;
        seen[k] = true;
        out.push({ key: k, spec: spec });
      });
    });
    return out;
  }
  // rsTimeline (page-storyboard.js) builds its t = 0 on first_game_frame_to_copyright_visible, and the storyboard
  // canvas is drawn at the cue engine's clock, so the two have to share an origin or the scene on screen runs
  // lagFrames away from the tone. They did share one while both counted from the fade start. Until rsTimeline takes
  // the visible frame itself - the way gen1Timeline was moved to menu_visible - the timeline it returns is re-based
  // here, which is a shift of every time by the same lagS and leaves its frame numbers alone.
  var pure = { checkLcrng: checkLcrng, model: model, pair: pair, table: table, searchTid: searchTid, vectorOk: vectorOk, rsSeed: rsSeed, anchorFrame: anchorFrame, copyrightAnchor: copyrightAnchor, fps: fps, pressSeconds: pressSeconds, cueProgram: cueProgram,
    attestedPressFrames: attestedPressFrames, pMinOptions: pMinOptions, targetSetsFor: targetSetsFor, headWindow: headWindow, headRows: headRows };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'rs';
    var state = { lastRun: null };
    function p(k, d) { return A.pref(SEC, k, d); }
    function ctxFor(game) {
      checkLcrng(A.D);
      var g = model(A.D, game), notes = g.model.p_min_frames_notes;
      var pmo = pMinOptions(A.D, game), noteKeys = pmo.options.map(function (o) { return o.key; });
      // if the filter ever kept nothing, P_min would come out undefined and the page would build an empty table
      // without saying why. It cannot happen with the shipped data - every game attests at least one press frame -
      // which is exactly why it would be missed if it ever did.
      if (!noteKeys.length) fail('no P_min in ' + game + ' is attested as a press frame by a vector or a dead-battery check, so there is nothing safe to aim at');
      var noteKey = p('pMinNote', null); if (noteKeys.indexOf(noteKey) === -1) noteKey = noteKeys.filter(function (k) { return notes[k] === g.model.p_min_frames; })[0] || noteKeys[0];
      var battery = p('battery', 'dead'), seed = g.dead_battery_seed, clock = null, clockErr = null;
      if (battery === 'live') {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p('bootDate', ''))), t = /^(\d{2}):(\d{2})$/.exec(String(p('bootTime', '')));
        if (m && t) { clock = rsSeed(+m[1], +m[2], +m[3], +t[1], +t[2]); seed = clock.seed; } else clockErr = 'Type the boot date (YYYY-MM-DD) and time (HH:MM) the cartridge clock showed when you powered on.';
      }
      var horizonS = Number(p('horizonS', 60)) || 60, pMin = notes[noteKey], pMax = pMin + Math.round(horizonS * fps(A.D));
      // The starting correction comes from the data, like every other constant on this page.
      // gen3-rs.json carries it as null: no default HAS been measured (the harness fixes frame
      // counts on mGBA, not a human's reaction on hardware), so the page applies none until a
      // sample is recorded or an override is set. 100 ms used to be typed in here.
      var defs = A.D.gen3rs.defaults || {}, noDefault = defs.correction_ms == null, defaultMs = noDefault ? 0 : Number(defs.correction_ms);
      // The calibration store is keyed by the anchor as well as the game, the way the Gen 1 page keys its stores by
      // platform and anchor. Samples taken while the page counted from the fade start carry that 284.6 ms inside their
      // implied correction; averaged into the new anchor they would put every press 17 frames EARLY, so they stay in
      // their own store instead of being silently reused under a different meaning.
      var ca = copyrightAnchor(A.D, game), methId = g.methodology.id, calKey = 'rs.' + game + '.copyright-text', cal = A.cal(calKey);
      // only samples recorded under THIS methodology count - the flat mean over everything
      // stored under the game used to ignore the split submitGot writes
      var mine = A.G1.splitByMethodology(cal.samples, methId).kept;
      var usedMs = cal.override != null ? cal.override : A.G1.meanCorrection(mine, defaultMs);
      var aimedP = p('aimedP', null); if (!(Number.isInteger(aimedP) && aimedP >= pMin)) aimedP = null;
      return { game: game, g: g, methId: methId, defaultMs: defaultMs, noDefault: noDefault, notes: notes, noteKey: noteKey, pMinKeys: noteKeys, pMinOther: pmo.notPressFrames,
        sets: targetSetsFor(A.D, game), battery: battery, seed: seed, clock: clock, clockErr: clockErr, pMin: pMin, pMax: pMax, horizonS: horizonS, correction: usedMs, cal: cal, calKey: calKey, anchor: ca, aimedP: aimedP, beeps: Number(p('beeps', A.D.gen1.defaults.count_in_beeps)) || 0 };
    }
    function rowsHtml(ctx, rows, withNeighbours) {
      return '<table class="tbl"><tr><th>P</th><th>after frame ' + ctx.anchor.visibleFrame + '</th><th>TID</th><th>SID</th><th></th></tr>' + rows.map(function (r) {
        // only headRows() sets `attested`, so every other tab renders exactly the cell it rendered before
        return '<tr' + (ctx.aimedP === r.P ? ' class="sel"' : '') + '><td>' + r.P + (r.attested ? ' <span class="tag ok">recorded</span>' : '') + '</td><td>' + A.fmtS(pressSeconds(A.D, ctx.game, r.P), 2) + '</td><td class="mono">' + esc(A.fmtTid(r.tid)) + '</td><td class="mono">' + esc(A.fmtTid(r.sid)) + '</td><td><button type="button" class="secondary small" data-rs-aim="' + r.P + '">aim</button></td></tr>';
      }).join('') + '</table>';
    }
    function targetsHtml(ctx) {
      // the Target sets tab is offered only when the data holds a set for THIS game. It used to be offered
      // unconditionally over gen1-tid.json's whole block, which put Red/Blue and Yellow route targets on a Gen 3 page.
      var tabs = [['tid', 'Typed Trainer ID'], ['table', 'Next ' + ctx.horizonS + ' s']];
      if (ctx.sets.length) tabs.push(['set', 'Target sets']);
      var mode = p('targetMode', 'tid');
      if (!tabs.some(function (x) { return x[0] === mode; })) mode = 'tid';
      var h = '<div class="tabs">' + tabs.map(function (x) { return '<button type="button" class="tab' + (mode === x[0] ? ' active' : '') + '" data-rs-mode="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
      if (ctx.clockErr) return h + '<p class="warn">' + esc(ctx.clockErr) + '</p>';
      if (mode === 'tid') {
        h += '<label class="field">Trainer ID wanted (decimal or $hex)<input type="text" id="rs-tid" value="' + esc(p('tid', '')) + '"></label><div id="rs-tid-result">' + tidResultHtml(ctx) + '</div>';
      } else if (mode === 'table') {
        var rows = table(A.D, ctx.game, ctx.seed, ctx.pMin, ctx.pMax);
        h += '<p class="small muted">Every frame from P_min = ' + ctx.pMin + ' for ' + ctx.horizonS + ' s (' + rows.length + ' frames): the (TID, SID) pair the press on that frame gives.</p><div class="scroll">' + rowsHtml(ctx, rows) + '</div>';
      } else {
        var keys = ctx.sets.map(function (s) { return s.key; }), key = p('set', keys[0]);
        if (keys.indexOf(key) === -1) key = keys[0];
        var chosen = ctx.sets[keys.indexOf(key)];
        var ts = A.G1.makeTargetSet(chosen.key, chosen.spec);
        h += A.select('rs-set', ctx.sets.map(function (s) { return { id: s.key, title: s.spec.name }; }), key, 'Target set (only sets whose own games list names ' + esc(ctx.game) + ')');
        var rows2 = table(A.D, ctx.game, ctx.seed, ctx.pMin, ctx.pMax).filter(function (r) { return A.G1.setAccepts(ts, r.tid); });
        h += rows2.length ? '<p>' + rows2.length + ' frame' + (rows2.length === 1 ? '' : 's') + ' in the next ' + ctx.horizonS + ' s give a member of ' + esc(ts.key) + ':</p>' + rowsHtml(ctx, rows2.slice(0, 60)) : '<p class="warn">No frame in the next ' + ctx.horizonS + ' s gives a member of ' + esc(ts.key) + '; widen the horizon.</p>';
      }
      if (!ctx.sets.length) h += '<p class="small muted">No target set in the data lists ' + esc(ctx.game) + ' in its own games, so there is no Target sets tab. Type the Trainer ID you want instead.</p>';
      if (ctx.aimedP !== null) { var pr = pair(A.D, ctx.game, ctx.seed, ctx.aimedP); h += '<p class="aim">Aim: press on frame P = <b>' + ctx.aimedP + '</b> = ' + A.fmtS(pressSeconds(A.D, ctx.game, ctx.aimedP), 2) + ' after the copyright text is fully drawn (frame ' + ctx.anchor.visibleFrame + ') -> TID ' + esc(A.fmtTid(pr.tid)) + ', SID ' + esc(A.fmtTid(pr.sid)) + '. Neighbours: ' + [-1, 1].map(function (d) { var q = pair(A.D, ctx.game, ctx.seed, ctx.aimedP + d); return 'P' + (d > 0 ? '+1' : '-1') + ' -> TID ' + A.fmtTid(q.tid) + ' / SID ' + A.fmtTid(q.sid); }).join('; ') + '.</p>' +
        '<p class="small">That one press decides <b>both</b> IDs: on Ruby/Sapphire the SID is the very next Random() output after the TID, so landing frame P fixes the pair. This is the only Gen 3 game where the SID can be chosen outright - on Emerald and FireRed/LeafGreen the TID is a free-running timer and the SID has to be deduced afterwards (the <b>Gen 3 SID</b> mode).</p>'; }
      return h;
    }
    // WHY THE PAGE USED TO OPEN ON A DEAD END. targetMode defaults to 'tid' and the Trainer ID box starts empty,
    // and tidResultHtml returned '' for an empty box. So on both games the page opened as two tabs, one empty text
    // field and not a single aim button anywhere on it, while section 7 said "pick a target frame to build the
    // cue": an instruction with nothing on the open tab to act on. The frames were there the whole time - the
    // Next 60 s tab renders all 3585 of them, P_min to P_min + 3584, each with its own aim button - but nothing on
    // the tab in front of the runner said so, so a runner who did not think to change tabs had no route to a cue
    // at all. The empty box now lists the earliest presses the chosen opening path allows and names the box and
    // the tab by the words printed on them. No target is aimed on the runner's behalf: the press decides both IDs,
    // so which frame to want is the runner's choice and the page only has to make one reachable.
    function headHtml(ctx) {
      var hr = headRows(A.D, ctx.game, ctx.seed, ctx.pMin, ctx.pMax), n = hr.rows.length;
      var h = '<p class="small muted">Nothing typed yet. Type the Trainer ID you want in the box above and this tab lists the frames that give it; open <b>Next ' + ctx.horizonS + ' s</b> for every frame from P_min; or aim at one of the earliest presses below.</p>';
      h += '<p class="small">The first ' + n + ' frame' + (n === 1 ? '' : 's') + ' this opening path allows. P_min = ' + ctx.pMin + ' is the earliest frame the last box accepts A, ' +
        A.fmtS(pressSeconds(A.D, ctx.game, ctx.pMin), 2) + ' after the copyright text is fully drawn (frame ' + ctx.anchor.visibleFrame + ').</p>';
      h += hr.check
        ? '<p class="small muted">The rows marked <span class="tag ok">recorded</span> are the pairs gen3-rs.json\'s dead-battery check <span class="mono">' + esc(hr.check.run) + '</span> recorded at seed ' + hr.check.read_back + ' (its pairs_P_min_to_plus5 block), reproduced here by this page\'s own model.</p>'
        : '<p class="small muted">gen3-rs.json records no dead-battery check at seed ' + ctx.seed + ' with P_min ' + ctx.pMin + ', so these rows are this page\'s model applied to those frames and none of them is a recorded pair.</p>';
      return h + rowsHtml(ctx, hr.rows);
    }
    function tidResultHtml(ctx) {
      var text = String(p('tid', '')).trim(); if (!text) return headHtml(ctx);
      var tid; try { tid = A.G1.parseTid(text); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      var hits = searchTid(A.D, ctx.game, ctx.seed, tid, ctx.pMin, ctx.pMax, 20);
      var h = '<p class="small muted">A given Trainer ID recurs about once every 65,536 frames (' + (65536 / fps(A.D) / 60).toFixed(1) + ' minutes) on average: the horizon decides whether it is reachable soon.</p>';
      h += A.sourcesHtml(ctx.game, tid, 'derived');
      if (!hits.length) return h + '<p class="warn">' + esc(A.fmtTid(tid)) + ' does not occur between P = ' + ctx.pMin + ' and ' + ctx.pMax + ' (the next ' + ctx.horizonS + ' s). Widen the horizon.</p>';
      return h + '<p>' + esc(A.fmtTid(tid)) + ' occurs at:</p>' + rowsHtml(ctx, hits);
    }
    // What section 7 says while there is no cue to play. It used to say "Pick a target frame to build the cue",
    // which named the task and not the control: on the tab the page opens on there was nothing to pick, and with
    // a live battery and no clock typed there is nothing to pick anywhere until the seed is known. Both states
    // now name the section, the control and the words printed on it.
    function noAimHtml(ctx) {
      return ctx.clockErr
        ? '<p class="muted">No cue yet: with a live battery the seed is not known until the boot clock is typed, so no frame has a (TID, SID) pair to aim at. Fill in <b>Boot date</b> and <b>Boot time</b> in <b>2. Battery</b>.</p>'
        : '<p class="muted">No cue yet: no frame is aimed. In <b>4. Target</b>, press <b>aim</b> on one of the rows - the earliest presses this opening path allows are listed there before anything is typed - or type the Trainer ID you want in <b>Trainer ID wanted</b> first and aim at one of the frames that give it.</p>';
    }
    function program(ctx) {
      var c = cueProgram(A.G1, A.D, ctx.game, ctx.aimedP, ctx.correction, ctx.beeps, A.D.gen1.defaults.count_in_spacing_s), tA = c.tA;
      return { cues: c.cues, visuals: A.Cue.visualsFor(c.cues, 1.0), endT: tA + 1.5, label: ctx.g.methodology.id + ' P ' + ctx.aimedP, clock: function (t) { return t < tA ? 'A in ' + (tA - t).toFixed(2) + ' s' : 'done'; } };
    }
    // submit() for the shared calibration widget (page-widgets.js): {lines, recorded, samples}
    function submitGot(ctx, text) {
      var tid; try { tid = A.G1.parseTid(text); } catch (e) { return { lines: ['Enter the Trainer ID as decimal or $hex: ' + A.errMsg(e) + '.'] }; }
      var run = state.lastRun;
      // A cue played for the other game, or under another opening path, must not calibrate
      // this one. Ruby and Sapphire share seed 1440 and offset 72 but not P_min (4351 vs
      // 4343), so a cross-context record would have looked right and been a frame out.
      if (run && (run.game !== ctx.game || run.methId !== ctx.methId)) {
        return { lines: ['Not recorded: the last cue was played for ' + run.methId + ', and this is ' + ctx.methId + '. Play a cue for this game and opening path, then record what you got.'] };
      }
      var aim = run ? run.P : ctx.aimedP, used = run ? run.correction : ctx.correction, seed = run ? run.seed : ctx.seed;
      if (aim == null) return { lines: ['Pick a target first: the calibration needs the frame you aimed at.'] };
      var lo = Math.max(0, aim - 1200), hi = aim + 1200, hits = searchTid(A.D, ctx.game, seed, tid, lo, hi, 0);
      if (!hits.length) return { lines: ['You got ' + A.fmtTid(tid) + ': it does not occur within 1200 frames of P = ' + aim + ' under seed ' + seed + '. Usual causes: the battery is not dead (the battery-dry box did not show), a different opening path than the one chosen in 3, or a press far outside the horizon.'] };
      var best = hits[0]; hits.forEach(function (r) { if (Math.abs(r.P - aim) < Math.abs(best.P - aim)) best = r; });
      var err = best.P - aim, ms = err / fps(A.D) * 1000;
      var lines = ['You got ' + A.fmtTid(tid) + ' (SID ' + A.fmtTid(best.sid) + '): landed on P = ' + best.P + ', aimed ' + aim + ': ' + (err === 0 ? 'exact.' : Math.abs(err) + ' frame' + (Math.abs(err) === 1 ? '' : 's') + ' ' + (err > 0 ? 'late' : 'early') + ' (' + A.fmtMs(Math.abs(ms)) + ').')];
      var sample = A.G1.makeSample(tid, aim, best.P, used, { attempt: run ? run.attempt : null, methodology: ctx.methId, player: 'app' });
      sample.seed = seed;
      state.lastRun = null;
      return { lines: lines, recorded: true, samples: ctx.cal.samples.concat([sample]) };
    }
    function statusHtml(ctx) {
      var g = ctx.g, m = g.methodology;
      return A.statusBlock([
        ['Methodology', m.id + ': ' + m.name], ['Status', g.status], ['Platform', m.console || 'GBA (' + g.rom + ', sha1 ' + g.rom_sha1 + ')'], ['Model', g.model.formula], ['Anchor', g.model.anchor.notes],
        ['Counted from', 'frame ' + ctx.anchor.visibleFrame + ', the copyright text fully black-on-white. The fade out of white starts on frame ' + ctx.anchor.fadeFrame + ', ' + ctx.anchor.lagFrames + ' frames (' + A.fmtMs(ctx.anchor.lagS * 1000) + ') earlier; that frame is a pixel measurement and not a cue a person can take.'],
        ['Seed', ctx.battery === 'dead' ? 'dead battery: S = ' + g.dead_battery_seed + ' (0x' + g.dead_battery_seed.toString(16).toUpperCase() + ')' : 'live battery: S = fold(minute count) = ' + ctx.seed + (ctx.clock ? ' (day count ' + ctx.clock.dayCount + ', minute count ' + ctx.clock.minuteCount + ')' : '')],
        ['Seed formula', ctx.battery === 'dead' ? null : A.D.gen3rs.live_battery_seed.formula], ['P_min', ctx.noteKey + ': ' + ctx.pMin], ['Validity', A.VALID_ONLY], ['Frames', A.D.gen3rs.frame_convention],
        ['Vectors', g.vectors.length + ' emulator vectors in the data. This app\'s tests replay all ' + g.vectors.length + ' through this page\'s pair() (tests/tid-helper/rs.test.cjs); that is the app\'s claim, not the data\'s.'], ['Source', A.D.gen3rs.source]
      ]) + A.details('Validity conditions (' + m.validity.length + ')', '<ol class="plain">' + m.validity.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ol>') + A.details('Citations', '<ul class="plain small">' + g.citations.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>');
    }
    function render(el, game) {
      var ctx = ctxFor(game), g = ctx.g;
      var h = '<h2>' + esc(g.methodology.name) + '</h2>';
      h += A.card('<h3>What this is for</h3>' +
        '<p class="small">Ruby and Sapphire are the one Gen 3 pair whose Trainer ID and Secret ID can actually be aimed at. The RNG is seeded once at boot and nothing on the New Game path reseeds it, so the pair the game rolls is a function of the frame you press on. Two things use that: picking a trainer shiny value for <b>shiny hunting</b>, and <b>Any% strategies that need a specific TID/SID pair</b>.</p>' +
        '<p class="small muted">Emerald, FireRed and LeafGreen are absent because of the games, not because of a gap here. They reseed the RNG as you leave the player naming screen and take the Trainer ID straight from the hardware timer TM1CNT_L - a sub-frame count, so aiming at a pair there is practically impossible. The most any tool can do for those three is tell you the Secret ID you already got, from the Trainer ID you already have, which is identification rather than manipulation.</p>' +
        '<p class="small muted">Separately: the Gen 3 RNG work most runs rely on is <b>encounter manipulation</b> on an existing save, reached by a hard reset with held inputs. That is a different technique and this page does not do it.</p>' +
        '<p class="small muted"><b>Credit.</b> What this page says about its own scope was corrected by <b>ConstructiveCynicism</b> (that the page did not say what it was for, and that the Trainer ID is reseeded at the naming screen in Emerald and FireRed/LeafGreen) and <b>CasualPokePlayer</b> (that the Ruby/Sapphire pair does have Any% use, and that it is those three games where it is impractical). Neither endorses this tool or has checked it.</p>');
      h += A.card('<h3>1. The model</h3><p class="small">' + esc(g.model.formula.split('. Pseudo-code')[0]) + '</p><p class="small muted">Citation: ' + esc(g.seed_citation.split('. src/rtc.c')[0]) + '.</p>');
      h += A.card('<h3>2. Battery</h3>' + A.choices('rs-battery', [{ id: 'dead', title: 'Dead battery', sub: 'the battery-dry box shows on every power-on: S = ' + g.dead_battery_seed }, { id: 'live', title: 'Battery alive', sub: 'type the date and time the cartridge clock showed at power-on' }], ctx.battery) +
        (ctx.battery === 'live' ? '<div class="row"><label class="field">Boot date<input type="date" id="rs-date" value="' + esc(p('bootDate', '')) + '"></label><label class="field">Boot time (HH:MM)<input type="time" id="rs-time" value="' + esc(p('bootTime', '')) + '"></label></div>' + (ctx.clock ? '<p class="small">Seed ' + ctx.seed + ' (day count ' + ctx.clock.dayCount + ', minute count ' + ctx.clock.minuteCount + ').</p>' : '') : ''));
      h += A.card('<h3>3. Opening path and horizon</h3>' + A.select('rs-pmin', ctx.pMinKeys.map(function (k) { return { id: k, title: k + ' -> P_min ' + ctx.notes[k] }; }), ctx.noteKey, 'P_min (the earliest frame the last box accepts A)') +
        '<label class="field">Horizon (s after P_min)<input type="number" min="5" step="5" id="rs-horizon" value="' + ctx.horizonS + '"></label><label class="field">Count-in beeps<input type="number" min="0" max="9" id="rs-beeps" value="' + ctx.beeps + '"></label><p class="small muted">' + esc(g.model.opening_path) + '</p>' +
        (ctx.pMinOther.length ? '<p class="small muted">Also in the data\'s p_min_frames_notes, and not offered above because the data records no press on that frame, so it is not a P_min: ' +
          ctx.pMinOther.map(function (o) { return esc(o.key) + ' = ' + o.frames + ' frames'; }).join('; ') + '.</p>' : ''));
      h += A.card('<h3>4. Target</h3>' + targetsHtml(ctx));
      h += A.card('<h3>5. Correction and calibration</h3>' +
        (ctx.noDefault ? '<p class="small muted">No starting correction is in the data (' + esc(String((A.D.gen3rs.defaults || {}).correction_ms_note || 'none measured')) + '), so none is applied until you record a sample or set an override.</p>' : '') +
        A.widgets.calibrationHtml('rs-cal', ctx.calKey, ctx.methId, ctx.defaultMs, 1000 / fps(A.D),
          'After an attempt, type the Trainer ID from the Trainer Card. The engine finds the frame it came from (nearest your aim) and the implied correction: your reaction to the copyright text plus the audio delay, nothing else.', 'one GBA frame'));
      h += A.card('<h3>6. Protocol</h3>' + A.list(g.methodology.protocol.map(esc)) +
        // gen3-rs.json is generated upstream and its protocol names the anchor as the copyright screen FADING IN,
        // frame 4, which is what the harness detects. Every instruction on this page is counted from the frame the
        // same block records the text fully drawn on. Both numbers are right about different frames, and printed
        // side by side they read as a contradiction, so the difference is named here rather than the data edited.
        '<p class="small muted">Where that protocol gives the anchor as the copyright screen fading in (frame ' + ctx.anchor.fadeFrame + '), it is quoting the first frame with non-white pixels, which is what the emulator harness detects. Every time on this page is counted from frame ' + ctx.anchor.visibleFrame + ' instead, where the same data records the text fully black-on-white: ' + ctx.anchor.lagFrames + ' frames (' + A.fmtMs(ctx.anchor.lagS * 1000) + ') later. One GBA frame is ' + A.fmtMs(1000 / fps(A.D)) + ', and P-1 and P+1 give different Trainer IDs.</p>');
      h += A.card('<h3>7. Cue and storyboard</h3>' + (ctx.aimedP !== null && !ctx.clockErr ? '<p class="small muted">Tap when the copyright text is fully drawn, black on white (frame ' + ctx.anchor.visibleFrame + '). The screen starts fading up out of white ' + ctx.anchor.lagFrames + ' frames (' + A.fmtMs(ctx.anchor.lagS * 1000) + ') earlier, on frame ' + ctx.anchor.fadeFrame + ', and the text is not fully drawn in between: do not tap at the first hint of grey. The count-in then leads to the press at ' + A.fmtS(pressSeconds(A.D, game, ctx.aimedP), 2) + ' after the fully drawn text (minus the correction).</p>' + A.widgets.storyWidgetHtml('rs-story', 'the copyright text, fully drawn', null) : noAimHtml(ctx)) +
        A.toolsHtml(['eontimer'], 'This press-at-a-frame cue is the job of EonTimer\'s Gen 3 timer, which the community uses for the dead-battery Ruby/Sapphire manip; the correction plays the part of its calibration:'));
      h += A.sourcesCard(game);
      h += A.card('<h3>Status (from the data)</h3>' + statusHtml(ctx));
      el.innerHTML = h;
      A.widgets.bindCalibration('rs-cal', { key: ctx.calKey, methId: ctx.methId, defaultMs: ctx.defaultMs, onChange: function () { A.render(); },
        submit: function (text) { var res = submitGot(ctx, text); if (res.recorded) A.setCal(ctx.calKey, { samples: res.samples, override: ctx.cal.override }); return res; } });
      if (ctx.aimedP !== null && !ctx.clockErr) A.widgets.mountStory({ id: 'rs-story', gameName: game, timeline: function () { return A.Story.rsTimeline(A.D, game, ctx.aimedP, ctx.pMin); }, program: function () { return program(ctx); },
        onStart: function (mode) { if (mode === 'run') state.lastRun = { game: ctx.game, methId: ctx.methId, attempt: 'app-' + Date.now().toString(36), P: ctx.aimedP, correction: ctx.correction, seed: ctx.seed }; } });
    }
    function onEvent(ev, game) {
      var t = ev.target, ctx;
      if (ev.type === 'click') {
        var c = t.closest('[data-choice="rs-battery"]'); if (c) { A.setPref(SEC, { battery: c.getAttribute('data-id'), aimedP: undefined }); return 'render'; }
        var m = t.closest('[data-rs-mode]'); if (m) { A.setPref(SEC, { targetMode: m.getAttribute('data-rs-mode') }); return 'render'; }
        var a = t.closest('[data-rs-aim]'); if (a) { A.setPref(SEC, { aimedP: Number(a.getAttribute('data-rs-aim')) }); return 'render'; }
      } else {
        if (t.id === 'rs-tid') { A.setPref(SEC, { tid: t.value }); var r = A.$('rs-tid-result'); if (r) r.innerHTML = tidResultHtml(ctxFor(game)); }
        else if (t.id === 'rs-date') { A.setPref(SEC, { bootDate: t.value }); return 'render'; }
        else if (t.id === 'rs-time') { A.setPref(SEC, { bootTime: t.value }); return 'render'; }
        else if (t.id === 'rs-pmin') { A.setPref(SEC, { pMinNote: t.value, aimedP: undefined }); return 'render'; }
        else if (t.id === 'rs-horizon') { A.setPref(SEC, { horizonS: Number(t.value) }); return 'render'; }
        else if (t.id === 'rs-beeps') { A.setPref(SEC, { beeps: Number(t.value) }); return 'render'; }
        else if (t.id === 'rs-set') { A.setPref(SEC, { set: t.value }); return 'render'; }
      }
      return null;
    }
    A.registerMode({ id: 'gen3-rs', title: 'Dead-battery boot seed', games: ['ruby', 'sapphire'], render: render, onEvent: onEvent,
      line: function (game) { return model(A.D, game).status; }, sub: function (game) { return model(A.D, game).methodology.id; } });
  }
  return pure;
});
