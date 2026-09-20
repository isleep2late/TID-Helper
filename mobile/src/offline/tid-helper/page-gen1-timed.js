// TID Helper page: the Gen 1 timed hold-START method (Red / Blue / Yellow), a port of the site's Gen1Flow
// (src/app/rng-solution/page.tsx): platform -> methodology (the engine's methodologyIdFor) -> target (a typed Trainer
// ID inverted through the table, or the route's target sets) -> anchor -> the correction in force -> the numbered
// protocol -> the cue (ShinyGen1Tid.schedule, played by the cue engine with the storyboard) -> "what did you get?"
// (the engine's calibration sample arithmetic and P(hit)). The reset metronome for the save corruption is the
// engine's resetInterval / resetSchedule over the data's reset model. UMD: the pure part runs under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperGen1Timed = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  function context(D, G1, game, platformKey) {
    var g1 = D.gen1, platform = g1.platforms[platformKey];
    if (!platform) fail('no gen1 platform ' + platformKey);
    var methId = G1.methodologyIdFor(g1, game, platform.family), meth = g1.methodologies[methId];
    var anchors = platform.anchors.filter(function (a) { return meth.anchors.indexOf(a) !== -1; });
    var setKeys = (g1.games[game].default_target_sets || []).slice();
    var derivation = G1.derivationPlatform(g1, game, methId, setKeys.length ? setKeys : null);
    // The detector-to-box lag is resolved HERE, not in the UI wrapper, so that every caller of context() gets it:
    // it is a property of the methodology, and a schedule built without it aims three quarters of a second late.
    var vm = visibleMenu(D, methId, meth.timing);
    return { game: game, platformKey: platformKey, platform: platform, family: g1.families[platform.family], methId: methId, meth: meth, timing: meth.timing,
      resetModel: g1.reset_models[platform.reset], anchors: anchors, derivation: derivation, table: derivation.table, sets: derivation.targetSets, setKeys: setKeys,
      visibleMenuError: vm.error || null, visibleLagS: vm.error ? 0 : vm.lagS, visibleLagFrames: vm.error ? null : vm.lagFrames, visibleFrame: vm.error ? null : vm.visibleFrame };
  }
  function schedule(G1, ctx, anchor, offset, correctionMs, beeps, spacingS) {
    return G1.schedule(anchor, offset, correctionMs, { family: ctx.timing, beeps: beeps, spacingS: spacingS, visibleLagS: ctx.visibleLagS || 0,
      resetModel: anchor === 'reset' ? ctx.resetModel : undefined, methodology: ctx.meth });
  }
  // menu_open (the derivation harness's detector, which the tables' offsets are counted from) against menu_visible
  // (the frame the NEW GAME box is actually drawn on, the first non-blank frame after it - scene-timelines measures
  // both). On Red, Blue and Yellow they are 46 to 53 frames apart. Everything this page asks a person to do is
  // anchored on the box, so the lag has to be given back somewhere; it is given back here, once, and the two
  // numbers are cross-checked because if the timing block and the traces ever stopped agreeing about the detector
  // frame then the lag computed from one and applied to the other would be silently wrong.
  function visibleMenu(D, methId, timing) {
    var e = D.scenes && D.scenes.methodologies && D.scenes.methodologies[methId];
    if (!e || !e.events || typeof e.events.menu_visible !== 'number' || typeof e.events.menu_open !== 'number') {
      return { error: 'scene-timelines.json carries no menu_open / menu_visible for ' + methId + ', so the lag between the detector and the box you can see is unknown.' };
    }
    if (e.events.menu_open !== timing.menu_frame) {
      return { error: 'gen1-tid.json puts the menu detector at frame ' + timing.menu_frame + ' and scene-timelines.json at frame ' + e.events.menu_open + ' for ' + methId + '. Until they agree, no cue time on this page can be trusted.' };
    }
    var fps = 4194304 / 70224;
    var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(D.scenes.fps_expression));
    if (m) fps = Number(m[1]) / Number(m[2]);
    return { detectorFrame: e.events.menu_open, visibleFrame: e.events.menu_visible, lagFrames: e.events.menu_visible - e.events.menu_open, lagS: (e.events.menu_visible - e.events.menu_open) / fps };
  }
  function routeValid(G1, ctx) { return G1.routeValidTargets(ctx.table, ctx.sets).map(function (e) { return { offset: e[0], tid: e[1], label: G1.derivationLabel(ctx.derivation, e[0]) }; }); }
  function invertTid(G1, ctx, tid) { return G1.invert(ctx.table, tid); }
  // the numbered protocol, from the methodology's own numbers plus the schedule (the site's wording)
  function protocolLines(G1, D, ctx, anchor, s, aimed, correction, beeps, spacing, fmt) {
    var timing = ctx.timing, meth = ctx.meth, pk = ctx.platformKey, out = [];
    var holdLo = G1.framesToSeconds(timing.hold_lo_frame), holdHi = G1.framesToSeconds(timing.hold_hi_frame);
    out.push('Clear the save: on the title screen hold UP + SELECT + B, confirm YES, then power fully OFF. (A CONTINUE option on the menu means the attempt is invalid: the table assumes a fresh NEW GAME menu.)' + (pk === 'gse' ? ' On GSE keep a ROM copy with no .sav beside it, or NEW GAME silently becomes CONTINUE.' : ''));
    if (anchor === 'menu') {
      out.push((pk === 'gse' ? 'Power on (Ctrl+R hard reset on GSE)' : ctx.anchors.indexOf('reset') !== -1 ? 'Power on (or hard reset)' : 'Power on') + '. Touch nothing during the boot and intro.');
      out.push('Between ' + fmt.s(holdLo, 2) + ' and ' + fmt.s(holdHi, 2) + ' after the boot starts (frames ' + timing.hold_lo_frame + '-' + timing.hold_hi_frame + '), HOLD START and keep holding. Anywhere inside that window gives the same result: this press is NOT timed.' + (meth.landmark ? ' Landmark: ' + meth.landmark + '.' : ''));
      // The frame the runner is asked to anchor on is the one the BOX is drawn on, not the detector frame the
      // table's offsets are counted from. This sentence used to quote the detector - "the menu opens at 26.00 s
      // (frame 1553)" - beside an instruction to tap when the menu appears, which is 48 frames later.
      var boxF = ctx.visibleFrame == null ? timing.menu_frame : ctx.visibleFrame;
      out.push('The NEW GAME box is drawn at ' + fmt.s(G1.framesToSeconds(boxF), 2) + ' (frame ' + boxF + (ctx.visibleLagFrames ? '; the game decides ' + ctx.visibleLagFrames + ' frames = ' + fmt.ms(ctx.visibleLagS * 1000) + ' earlier, at frame ' + timing.menu_frame + ', but nothing is on screen until the box)' : '') + '). The INSTANT you see it, tap the Run button. Release START whenever you like; release timing does not matter.');
      // Say how many beeps will actually SOUND. The count-in is dropped a beep at a time when the aim sits closer
      // to the anchor than the count-in is long (countInCues' notBefore), and this branch used to print the
      // requested number regardless - so a tight aim promised four beeps and played one. The power-on branch
      // below has always printed the played count; the menu branch never did.
      var played = s ? beeps - s.droppedCountIn : beeps;
      out.push('You will hear ' + played + ' short beep' + (played === 1 ? '' : 's') + ' ' + spacing.toFixed(1) + ' s apart (white flashes with the numerals), then one long high beep with a green "A!". Press A ON the long high beep. That is the only frame-exact action.' +
        (s && s.droppedCountIn ? ' (' + s.droppedCountIn + ' count-in beep' + (s.droppedCountIn === 1 ? '' : 's') + ' left out: they would have been due before your tap.)' : '') +
        (aimed ? ' Target: A at ' + fmt.s(G1.targetSeconds(aimed.offset) - (ctx.visibleLagS || 0)) + ' after the box appears (the table\'s frame ' + G1.pressFrameFromMenu(aimed.offset) + ' after the detector, which is ' + fmt.s(G1.targetSeconds(aimed.offset)) + ' after it). The beep is ' + fmt.ms(correction) + ' early to cover your reaction to the box plus the audio delay (the correction; the calibration tunes it).' : ' Pick a target to see the numbers.'));
    } else {
      out.push((anchor === 'reset' ? 'Tap the Run button at the SAME instant you press ' + (pk === 'gse' ? 'Ctrl+R (the hard reset)' : 'the GameCube RESET button') + '.' : 'Tap the Run button at the SAME instant you flip the power on.') +
        (ctx.platform.anchor_notes && ctx.platform.anchor_notes[anchor] ? ' ' + ctx.platform.anchor_notes[anchor] : '') + ' Touch nothing during the boot and intro.');
      if (s && s.holdLo !== null && s.holdHi !== null && s.menu !== null) {
        out.push('Two low beeps (blue "HOLD START" flashes) mark the START-hold window: ' + fmt.s(s.holdLo, 2) + ' and ' + fmt.s((s.holdLo + s.holdHi) / 2, 2) + ' after your tap. HOLD START on the first low beep and keep holding. Anywhere in ' + fmt.s(s.holdLo, 2) + '-' + fmt.s(s.holdHi, 2) + ' is fine.');
        // The blip is what the runner compares against their own eyes, so it sounds when the BOX is drawn, not when
        // the game's menu detector fires. It used to sound on the detector - 46 to 53 frames, 0.77 to 0.89 s, before
        // anything appeared - under a sentence telling the runner that a menu far from the blip meant a dead attempt.
        // Every correctly held attempt therefore looked like a failed one.
        out.push('A double blip (amber "MENU") at ' + fmt.s(s.menuVisible == null ? s.menu : s.menuVisible, 2) + ' marks when the NEW GAME box should appear (frame ' + (ctx.visibleFrame == null ? timing.menu_frame : ctx.visibleFrame) + ' of the boot). If the box appears far from the blip, START was held outside the window: the attempt is no good, reset and try again. Release START whenever.');
        out.push('Then ' + (beeps - s.droppedCountIn) + ' short beep' + (beeps - s.droppedCountIn === 1 ? '' : 's') + ' ' + spacing.toFixed(1) + ' s apart and one long high beep with a green "A!". Press A ON the long high beep. Target: A at ' + fmt.s(G1.targetSeconds(aimed ? aimed.offset : 0)) + ' after the menu = ' + fmt.s(s.menu + G1.targetSeconds(aimed ? aimed.offset : 0)) + ' after your tap. The beep is ' + fmt.ms(correction) + ' early for the audio delay (this anchor\'s correction).' +
          (s.droppedCountIn ? ' (' + s.droppedCountIn + ' count-in beep' + (s.droppedCountIn === 1 ? '' : 's') + ' left out: they would have sounded before the menu.)' : ''));
      } else {
        out.push('Two low beeps mark the START-hold window (frames ' + timing.hold_lo_frame + '-' + timing.hold_hi_frame + ' of the boot); HOLD START on the first and keep holding.');
        out.push('A double blip marks when the NEW GAME menu should appear (frame ' + timing.menu_frame + ').');
        out.push('Then the count-in beeps and one long high beep. Press A ON the long high beep. Pick a target to see the numbers.');
      }
    }
    out.push(ctx.sets.some(function (x) { return x.kind === 'highbyte' || x.kind === 'sled'; })
      ? 'Afterwards, type the Trainer ID you got below (a Pokemon\'s status screen shows IDNo; in the route, whether the corruption completes tells you the high byte was $40, which is the whole rule). Each answer sharpens the correction.'
      : 'Afterwards, type the Trainer ID you got below (read it off the Trainer Card, or a Pokemon\'s status screen shows IDNo). Each answer sharpens the correction.');
    return out;
  }
  // the site's submitGot: a typed Trainer ID after a cue -> the offset hit, the implied correction, the sample (or why not)
  function submitGot(G1, ctx, anchor, cal, lastRun, aimedOffset, correction, defaultMs, text, force, fmt, anchorLabel) {
    var tid;
    try { tid = G1.parseTid(text); } catch (e) { return { lines: ['Enter the Trainer ID as decimal (16387) or hex ($4003 / 0x4003): ' + (e.message || e) + '.'] }; }
    if (lastRun && (lastRun.platformKey !== ctx.platformKey || lastRun.methId !== ctx.methId || lastRun.anchor !== anchor)) {
      return { lines: ['Not recorded: the last cue (attempt ' + lastRun.attempt + ') was played for ' + lastRun.methId + ' on ' + lastRun.platformKey + ', ' + anchorLabel[lastRun.anchor] + ' anchor, and the page now shows ' + ctx.methId + ' on ' + ctx.platformKey + ', ' + anchorLabel[anchor] + ' anchor. Switch back to record that attempt where it belongs, or forget the cue to record under the current choice with the correction in force.'] };
    }
    var aimOff = lastRun ? lastRun.aimed : aimedOffset, used = lastRun ? lastRun.correction : correction;
    if (aimOff == null) return { lines: ['Pick a target first: the calibration needs the offset you aimed at.'] };
    var lines = ['You got ' + G1.formatTid(tid) + ': ' + G1.verdictText(tid, ctx.sets) + '.'];
    var offs = G1.invert(ctx.table, tid);
    if (!offs.length) {
      lines.push('That Trainer ID is not in the ' + ctx.platform.name + ' table (' + ctx.methId + '), so nothing can be learned from it. Usual causes: START held outside the window, the save was not cleared (a CONTINUE menu), a different console family, or the press was later than the table\'s ' + G1.targetSeconds(ctx.table.length - 1).toFixed(1) + ' s. Correction unchanged.');
      return { lines: lines };
    }
    var hit = G1.nearestOffset(offs, aimOff);
    if (offs.length > 1) lines.push('(' + G1.formatTid(tid) + ' comes from offsets ' + offs.join(', ') + '; using ' + hit + ', the one nearest your aim.)');
    var err = G1.errorFrames(hit, aimOff);
    lines.push(err === 0 ? 'You hit offset ' + hit + ' exactly (aimed ' + aimOff + ').' : 'You hit offset ' + hit + ', aimed ' + aimOff + ': ' + Math.abs(err) + ' frame' + (Math.abs(err) === 1 ? '' : 's') + ' ' + (err > 0 ? 'late' : 'early') + ' (' + fmt.ms(Math.abs(G1.framesToMs(err))) + ').');
    var sample = G1.makeSample(tid, aimOff, hit, used, { attempt: lastRun ? lastRun.attempt : null, methodology: ctx.methId, player: 'app' });
    lines.push('Implied correction: ' + fmt.ms(used) + ' used ' + (err >= 0 ? '+' : '-') + ' ' + fmt.ms(Math.abs(G1.framesToMs(err))) + ' = ' + fmt.ms(sample.implied_ms) + '.');
    try {
      var next = G1.addSample(cal.samples, sample, force);
      var kept = G1.splitByMethodology(next, ctx.methId).kept, m = G1.meanCorrection(kept, defaultMs);
      lines.push('Recorded: ' + kept.length + ' sample' + (kept.length === 1 ? '' : 's') + ' on ' + ctx.platformKey + ', ' + anchorLabel[anchor] + ' anchor, under ' + ctx.methId + '. Correction in force is now ' + fmt.ms(m) + (cal.override != null ? ' (the mean; your override of ' + fmt.ms(cal.override) + ' is still in force until you clear it).' : '.'));
      return { lines: lines, recorded: true, samples: next };
    } catch (e) {
      if (e.name === 'OutlierSample') lines.push('That is more than ' + G1.OUTLIER_FRAMES + ' frames (' + G1.framesToSeconds(G1.OUTLIER_FRAMES).toFixed(1) + ' s) from the aim: NOT added to the calibration. Usual causes: START held outside the window (the table does not apply to that attempt), a mistyped Trainer ID, or the ID of a different attempt. If it really was this attempt, add it anyway.');
      else if (e.name === 'DuplicateSample') lines.push('This Trainer ID was already entered for the same aim (the same attempt twice?): not added. If it really is a new attempt, add it anyway.');
      else lines.push(e.message || String(e));
      return { lines: lines, forceable: true };
    }
  }
  var pure = { context: context, schedule: schedule, visibleMenu: visibleMenu, routeValid: routeValid, invertTid: invertTid, protocolLines: protocolLines, submitGot: submitGot };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'gen1timed';
    var fmt = { s: A.fmtS, ms: A.fmtMs };
    var ANCHOR_LABEL = { menu: 'menu', poweron: 'power-on', reset: 'reset' };
    var ANCHOR_BUTTON = { menu: 'the NEW GAME menu', poweron: 'power-on', reset: 'the reset press' };
    var state = { lastRun: null };
    function p(k, d) { return A.pref(SEC, k, d); }
    function ctxFor(game) {
      var g1 = A.D.gen1, pk = p('platform', g1.defaults.platform);
      if (!g1.platforms[pk]) pk = g1.defaults.platform;
      var ctx = context(A.D, A.G1, game, pk);
      var anchor = p('anchor', 'menu'); if (ctx.anchors.indexOf(anchor) === -1) anchor = ctx.anchors[0];
      ctx.anchor = anchor; ctx.calKey = 'gen1.' + pk + '.' + anchor; ctx.defaultMs = g1.defaults.correction_ms[anchor] == null ? 100 : g1.defaults.correction_ms[anchor];
      var cal = A.cal(ctx.calKey), mine = A.G1.splitByMethodology(cal.samples, ctx.methId).kept;
      ctx.correction = cal.override != null ? cal.override : A.G1.meanCorrection(mine, ctx.defaultMs);
      ctx.beeps = Number(p('beeps', g1.defaults.count_in_beeps)) || 0; ctx.spacing = g1.defaults.count_in_spacing_s;
      var aimedOff = p('aimed', null), entries = A.G1.tableEntries(ctx.table);
      ctx.aimed = null;
      if (typeof aimedOff === 'number') entries.forEach(function (e) { if (e[0] === aimedOff) ctx.aimed = { offset: e[0], tid: e[1] }; });
      ctx.sched = null; ctx.schedError = null;
      if (ctx.aimed) { try { ctx.sched = schedule(A.G1, ctx, anchor, ctx.aimed.offset, ctx.correction, ctx.beeps, ctx.spacing); } catch (e) { ctx.schedError = A.errMsg(e); } }
      return ctx;
    }
    function targetsHtml(game, ctx) {
      var mode = p('targetMode', 'set'), h = '<div class="tabs"><button type="button" class="tab' + (mode === 'set' ? ' active' : '') + '" data-g1-mode="set">Route targets</button><button type="button" class="tab' + (mode === 'tid' ? ' active' : '') + '" data-g1-mode="tid">Typed Trainer ID</button></div>';
      if (mode === 'set') {
        var rows = routeValid(A.G1, ctx);
        h += '<p class="small muted">Target sets in force: ' + ctx.sets.map(function (s) { return esc(A.G1.setDescribe(s)); }).join('; ') + '.</p>';
        h += rows.length ? '<table class="tbl"><tr><th>offset</th><th>TID</th><th>A after menu</th><th>derivation</th><th></th></tr>' + rows.map(function (r) {
          return '<tr' + (ctx.aimed && ctx.aimed.offset === r.offset ? ' class="sel"' : '') + '><td>' + r.offset + '</td><td class="mono">' + esc(A.fmtTid(r.tid)) + '</td><td>' + A.fmtS(A.G1.targetSeconds(r.offset)) + '</td><td class="small">' + esc(r.label) + '</td><td><button type="button" class="secondary small" data-g1-aim="' + r.offset + '">aim</button></td></tr>';
        }).join('') + '</table>'
          // counted, and with somewhere to go. This said only that nothing matched, on a tab whose whole purpose
          // is to give you something to aim at - and section 6 went on telling the runner to "pick a target",
          // which on this tab they cannot. On Yellow it is every platform: the set in force is psr-yellow and
          // none of the table's offsets reaches it on any of the five, so the route-target tab is empty
          // everywhere and the typed-Trainer-ID tab is the only way through to a cue.
          : '<p class="warn">None of this table\'s ' + ctx.table.length + ' offsets produces a member of the set'
            + (ctx.sets.length === 1 ? '' : 's') + ' in force (' + ctx.sets.map(function (x) { return esc(x.key); }).join(', ') + ') on '
            + esc(ctx.platform.name) + '.</p>'
            + '<p class="small">Every one of those ' + ctx.table.length + ' offsets is still aimable: switch to '
            + '<b>Typed Trainer ID</b> above, enter the Trainer ID you want, and the cue is built from it. '
            + 'The route targets are a shortlist for one speedrun route, not the limit of the method.</p>';
      } else {
        h += '<label class="field">Trainer ID (decimal or $hex)<input type="text" id="g1-tid" value="' + esc(p('tid', '')) + '" placeholder="16387 or $4003"></label><div id="g1-tid-result">' + tidResultHtml(ctx) + '</div>';
      }
      if (ctx.aimed) h += '<p class="aim">Aim: offset <b>' + ctx.aimed.offset + '</b> -> ' + esc(A.fmtTid(ctx.aimed.tid)) + ' (A at ' + A.fmtS(A.G1.targetSeconds(ctx.aimed.offset)) + ' after the menu). ' + esc(A.G1.derivationSentence(ctx.derivation, ctx.aimed.offset)) + '</p>';
      if (ctx.derivation.verifiedNote) h += '<p class="small muted">' + esc(ctx.derivation.verifiedNote) + '</p>';
      return h;
    }
    function tidResultHtml(ctx) {
      var text = String(p('tid', '')).trim(); if (!text) return '';
      var tid; try { tid = A.G1.parseTid(text); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      var offs = invertTid(A.G1, ctx, tid);
      var h = '<p>' + esc(A.fmtTid(tid)) + ': ' + esc(A.G1.verdictText(tid, ctx.sets)) + '.</p>' + A.sourcesHtml(ctx.game, tid, 'derived');
      if (!offs.length) return h + '<p class="warn">Not in this table (' + esc(ctx.methId) + ', offsets 0-' + (ctx.table.length - 1) + '): this methodology cannot reach it.</p>';
      return h + '<p>Offsets that give it: ' + offs.map(function (o) { return '<button type="button" class="secondary small" data-g1-aim="' + o + '">' + o + ' (' + A.fmtS(A.G1.targetSeconds(o)) + ', ' + esc(A.G1.derivationLabel(ctx.derivation, o) || 'not route-valid') + ')</button>'; }).join(' ') + '</p>';
    }
    function program(ctx) {
      var s = ctx.sched, tA = s.tA || 0, aHold = Number(p('aHoldS', A.Cue.A_HOLD_S)) || A.Cue.A_HOLD_S;
      return { cues: s.cues, visuals: A.Cue.visualsFor(s.cues, aHold), endT: tA + aHold + 0.2, label: ctx.methId + ' offset ' + ctx.aimed.offset + ' (' + ANCHOR_LABEL[ctx.anchor] + ' anchor)',
        clock: function (t) { return t < tA ? 'A in ' + (tA - t).toFixed(2) + ' s' : t < tA + aHold ? 'A!' : 'done'; } };
    }
    function metronomeHtml(ctx) {
      var rm = ctx.resetModel, preset = p('resetPath', 'route'), adjust = Number(p('resetAdjust', 0)) || 0, pairs = Number(p('resetPairs', A.D.gen1.defaults.reset_pairs)) || 15;
      var ri; try { ri = A.G1.resetInterval(rm, preset, null, adjust); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      return '<p class="small muted">' + esc(rm.description) + ' Reset model status for this platform: ' + esc(ctx.platform.reset_status) + '.</p>' +
        '<div class="row">' + A.select('g1-reset-path', Object.keys(rm.paths).map(function (k) { return { id: k, title: k + ': ' + rm.paths[k].description }; }), preset, 'Save path') +
        '<label class="field">Adjust (frames)<input type="number" step="0.5" id="g1-reset-adjust" value="' + adjust + '"></label>' + A.signButtonHtml('g1-reset-adjust') + '<label class="field">Pairs<input type="number" step="1" min="1" id="g1-reset-pairs" value="' + pairs + '"></label></div>' +
        '<p>' + esc(ri.order.join(' then ')) + ': interval ' + A.fmtMs(ri.centreMs) + ' (centre of the physical window ' + A.fmtMs(ri.physLoMs) + ' to ' + A.fmtMs(ri.physHiMs) + '; boundary ' + A.fmtMs(ri.boundaryLoMs) + ' to ' + A.fmtMs(ri.boundaryHiMs) + '), one pair every ' + A.D.gen1.defaults.reset_cadence_s + ' s.</p>' +
        '<button type="button" class="secondary small" data-g1-metro="start">Start the metronome</button> <button type="button" class="secondary small" data-g1-metro="stop">Stop</button>';
    }
    function startMetronome(ctx) {
      var rm = ctx.resetModel, preset = p('resetPath', 'route'), adjust = Number(p('resetAdjust', 0)) || 0, pairs = Number(p('resetPairs', A.D.gen1.defaults.reset_pairs)) || 15, cadence = A.D.gen1.defaults.reset_cadence_s;
      try {
        var ri = A.G1.resetInterval(rm, preset, null, adjust), s = A.G1.resetSchedule(ri.centreMs, ri.order, pairs, cadence, 1.0);
        A.Cue.arm();
        A.Cue.start(A.Cue.program({ cues: s.cues, visuals: A.Cue.visualsFor(s.cues), endT: s.duration + 0.5, label: 'reset metronome ' + ri.order.join('->') + ' ' + A.fmtMs(ri.centreMs),
          clock: function (t) { return 'pair ' + Math.max(1, Math.min(pairs, Math.floor((t - 1.0) / cadence) + 1)) + ' of ' + pairs; },
          onTick: function (t) { var clk = A.$('runclock'); if (clk) clk.textContent = 'T+' + t.toFixed(2) + ' s   pair ' + Math.max(1, Math.min(pairs, Math.floor((t - 1.0) / cadence) + 1)) + ' of ' + pairs; } }));
        var lbl = A.$('runlabel'); if (lbl) lbl.textContent = 'reset metronome';
      } catch (e) { A.reportError('metronome: ' + A.errMsg(e)); }
    }
    // What to say in the cue card when there is no target yet. "Pick a target" is only useful if the tab the
    // runner is looking at has one to pick; where the route-target list is empty it names the tab that does.
    function cueGapHtml(ctx) {
      var mode = p('targetMode', 'set');
      if (mode === 'set' && !routeValid(A.G1, ctx).length) {
        return '<p class="warn">No cue yet: no route target is reachable on ' + esc(ctx.platform.name)
          + ', so there is nothing to aim at on the Route targets tab.</p>'
          + '<p class="small">Switch to <b>Typed Trainer ID</b> in section 3 and enter one of this table\'s '
          + ctx.table.length + ' reachable Trainer IDs; the cue is built as soon as you aim at an offset.</p>';
      }
      return '<p class="muted">Pick a target in section 3 to build the cue.</p>';
    }
    function statusHtml(ctx) {
      var m = ctx.meth;
      return A.statusBlock([
        ['Methodology', ctx.methId + ' (v' + m.version + ', ' + m.date + '): ' + m.name],
        ['Status', m.status], ['Platform', ctx.platform.name + ' (' + ctx.platformKey + ')'], ['Platform status', ctx.platform.status], ['This platform', ctx.platform.validation],
        ['Console family', m.console_name], ['Predicts', m.predicts], ['Validity', A.VALID_ONLY], ['Anchor', A.D.gen1.anchor_names[ctx.anchor]],
        ['Reset anchor', ctx.anchor === 'reset' ? ctx.platform.reset_status : null], ['Scenes', A.D.scenes.status]
      ]) + A.details('Validity conditions (' + m.validity.length + ')', '<ol class="plain">' + m.validity.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ol>') +
        // gen1-tid.json is generated upstream (from RNG Solution's platforms.json) and its prose counts from the
        // menu DETECTOR - "the NEW GAME menu opens on frame 1553" - while every instruction this page gives counts
        // from the box. Both numbers are right about different frames, and printed side by side they read as a
        // contradiction, so the difference is named here rather than the generated data being edited by hand.
        A.details('Protocol as the data states it', '<p class="small">' + esc(m.protocol) + '</p>' +
          (ctx.visibleLagFrames ? '<p class="small muted">Frame numbers in that paragraph are the menu detector (frame ' + ctx.timing.menu_frame + '), which is what the derivation harness records. The box you watch for is drawn ' + ctx.visibleLagFrames + ' frames later, on frame ' + ctx.visibleFrame + ', and every instruction on this page is counted from there.</p>' : '')) + A.details('Validation and derivation', '<p class="small">' + esc(m.validation) + '</p><p class="small">' + esc(m.derivation) + '</p>');
    }
    function render(el, game) {
      var ctx = ctxFor(game), g1 = A.D.gen1;
      var h = '<h2>Timed method: ' + esc(g1.games[game].name) + '</h2>';
      h += A.card('<h3>1. Platform</h3>' + A.choices('g1-platform', Object.keys(g1.platforms).map(function (k) { var pl = g1.platforms[k]; return { id: k, title: pl.name, sub: pl.status + ' - ' + pl.validation }; }), ctx.platformKey) +
        '<p class="small muted">Methodology: <span class="mono">' + esc(ctx.methId) + '</span>. ' + esc(A.VALID_ONLY) + '</p>');
      h += A.card('<h3>2. Anchor</h3>' + A.choices('g1-anchor', ctx.anchors.map(function (a) { return { id: a, title: ANCHOR_LABEL[a], sub: g1.anchor_names[a] }; }), ctx.anchor) +
        '<label class="field">Count-in beeps<input type="number" min="0" max="9" id="g1-beeps" value="' + ctx.beeps + '"></label>' +
        (ctx.visibleMenuError ? '<p class="bad">' + esc(ctx.visibleMenuError) + '</p>'
          : ctx.visibleLagFrames ? '<p class="small muted">Every time on this page is counted from the frame the NEW GAME box is DRAWN (frame ' + ctx.visibleFrame + '), which is what you can see. The game makes its decision ' + ctx.visibleLagFrames + ' frames (' + A.fmtMs(ctx.visibleLagS * 1000) + ') earlier, at frame ' + ctx.timing.menu_frame + ', and the Trainer ID table counts its offsets from there.</p>' : ''));
      h += A.card('<h3>3. Target</h3>' + targetsHtml(game, ctx));
      h += A.card('<h3>4. Correction and calibration</h3>' + A.widgets.calibrationHtml('g1-cal', ctx.calKey, ctx.methId, ctx.defaultMs, A.G1.FRAME_MS, 'After an attempt, type the Trainer ID you got; the engine inverts it, measures how early or late the press was and updates the correction.'));
      h += A.card('<h3>5. Protocol</h3>' + A.list(protocolLines(A.G1, A.D, ctx, ctx.anchor, ctx.sched, ctx.aimed, ctx.correction, ctx.beeps, ctx.spacing, fmt).map(esc)));
      h += A.card('<h3>6. Cue and storyboard</h3>' + (ctx.schedError ? '<p class="bad">' + esc(ctx.schedError) + '</p>' : ctx.sched ? '<p class="small muted">A cue at ' + A.fmtS(ctx.sched.tA) + ' after the anchor; ' + ctx.sched.cues.length + ' tones.</p>' + A.widgets.storyWidgetHtml('g1-story', ANCHOR_BUTTON[ctx.anchor], null) : cueGapHtml(ctx)) +
        A.toolsHtml(['flowtimer'], 'This count-in and long beep is what the speedrunning community plays with FlowTimer for the Gen 1 manips, and the correction plays the part of its offset:'));
      if (ctx.anchors.length) h += A.card('<h3>7. Save-corruption reset metronome</h3>' + metronomeHtml(ctx));
      h += A.sourcesCard(game);
      h += A.card('<h3>Status (from the data)</h3>' + statusHtml(ctx));
      el.innerHTML = h;
      bind(game, ctx);
    }
    function bind(game, ctx) {
      A.widgets.bindCalibration('g1-cal', { key: ctx.calKey, methId: ctx.methId, defaultMs: ctx.defaultMs, onChange: function () { A.render(); },
        submit: function (text, force) {
          var cal = A.cal(ctx.calKey);
          var res = submitGot(A.G1, ctx, ctx.anchor, cal, state.lastRun, ctx.aimed ? ctx.aimed.offset : null, ctx.correction, ctx.defaultMs, text, force, fmt, ANCHOR_LABEL);
          if (res.recorded) { A.setCal(ctx.calKey, { samples: res.samples, override: cal.override }); state.lastRun = null; }
          return res;
        } });
      if (ctx.sched) A.widgets.mountStory({ id: 'g1-story', gameName: game,
        timeline: function () { return A.Story.gen1Timeline(A.D, ctx.methId, ctx.aimed.offset, ctx.anchor, ctx.anchor === 'reset' ? A.G1.resetAnchorExtraSeconds(ctx.resetModel) : 0); },
        program: function () { return program(ctx); },
        onStart: function (mode) { if (mode === 'run') state.lastRun = { attempt: 'app-' + Date.now().toString(36), aimed: ctx.aimed.offset, tid: ctx.aimed.tid, correction: ctx.correction, anchor: ctx.anchor, methId: ctx.methId, platformKey: ctx.platformKey }; } });
    }
    function onEvent(ev, game) {
      var t = ev.target;
      if (ev.type === 'click') {
        var c = t.closest('[data-choice]');
        if (c) { var n = c.getAttribute('data-choice'), id = c.getAttribute('data-id'); if (n === 'g1-platform') A.setPref(SEC, { platform: id, aimed: undefined }); else if (n === 'g1-anchor') A.setPref(SEC, { anchor: id }); else return null; return 'render'; }
        var m = t.closest('[data-g1-mode]'); if (m) { A.setPref(SEC, { targetMode: m.getAttribute('data-g1-mode') }); return 'render'; }
        var a = t.closest('[data-g1-aim]'); if (a) { A.setPref(SEC, { aimed: Number(a.getAttribute('data-g1-aim')) }); return 'render'; }
        var mt = t.closest('[data-g1-metro]'); if (mt) { if (mt.getAttribute('data-g1-metro') === 'start') startMetronome(ctxFor(game)); else A.widgets.stopAll(); return null; }
      } else {
        if (t.id === 'g1-tid') { A.setPref(SEC, { tid: t.value }); var r = A.$('g1-tid-result'); if (r) r.innerHTML = tidResultHtml(ctxFor(game)); }
        else if (t.id === 'g1-beeps') { A.setPref(SEC, { beeps: Number(t.value) }); return 'render'; }
        else if (t.id === 'g1-reset-path') { A.setPref(SEC, { resetPath: t.value }); return 'render'; }
        else if (t.id === 'g1-reset-adjust') { A.setPref(SEC, { resetAdjust: Number(t.value) }); return 'render'; }
        else if (t.id === 'g1-reset-pairs') { A.setPref(SEC, { resetPairs: Number(t.value) }); return 'render'; }
      }
      return null;
    }
    A.registerMode({ id: 'gen1-timed', title: 'Timed hold-START method', games: ['red', 'blue', 'yellow'], render: render, onEvent: onEvent,
      line: function (game) { var ctx = ctxFor(game); return ctx.meth.status; }, sub: function (game) { return ctxFor(game).methId; } });
  }
  return pure;
});
