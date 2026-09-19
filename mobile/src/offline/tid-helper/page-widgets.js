// TID Helper page: the DOM widgets the mode modules share. The storyboard widget owns one <canvas>, the Preview /
// Run / Stop buttons and the notes under it; it asks the mode for a timeline and a cue program, hands the cue engine
// a program whose onTick draws the canvas at the engine's clock (audio clock; performance.now() only when there is
// no AudioContext), and shows the engine's overlay both full-screen and on the canvas. The calibration block is the
// site's "what did you get?" flow shared by the Gen 1 and Gen 2 timed modes. Browser-only (no UMD).
(function (root) {
  'use strict';
  var A = root.TidHelperApp, Cue = root.TidHelperCue, Story = root.TidHelperStoryboard;
  var esc = A.esc;

  // ---- the full-screen flash overlay ---------------------------------------------------------------
  function overlayEl() { return A.$('flash'); }
  Cue.onOverlay = function (v) {
    var el = overlayEl();
    if (!el) return;
    if (!v || !A.pref('cue', 'flash', true)) { el.className = 'flash hidden'; el.textContent = ''; return; }
    el.className = 'flash ' + v.cls;
    el.textContent = v.text;
    el.style.fontSize = v.text.length > 4 ? '13vw' : '30vw';
  };
  Cue.onState = function () {
    var bar = A.$('runbar');
    if (!bar) return;
    bar.classList.toggle('hidden', !Cue.running);
    var st = A.$('cuestate');
    if (st) st.textContent = Cue.audioErr ? 'SOUND UNAVAILABLE: ' + Cue.audioErr : (Cue.armed ? 'sound ready' + (Cue.latencyMs ? ' (output latency ' + Cue.latencyMs + ' ms)' : '') : 'tap Preview or the anchor button to enable sound');
  };
  function stopAll() { Cue.stop(); }

  // ---- the storyboard widget ----------------------------------------------------------------------
  // spec: {id, timeline() -> tl | {error}, program(mode) -> Cue program (cues, visuals, endT, clock, label), anchorLabel,
  //        gameName, previewLead (seconds before the timeline start to begin the preview; default 0.5)}
  var widgets = {};
  function storyWidgetHtml(id, anchorLabel, noTimelineReason) {
    return '<div class="story" id="' + esc(id) + '">' +
      '<canvas id="' + esc(id) + '-canvas" width="360" height="330"></canvas>' +
      '<div class="row story-controls">' +
        '<button type="button" class="secondary small" data-story="' + esc(id) + '" data-act="preview"' + (noTimelineReason ? ' disabled' : '') + '>Preview (1x, no game)</button>' +
        '<button type="button" class="small anchor" data-story="' + esc(id) + '" data-act="run">Run: tap at ' + esc(anchorLabel) + '</button>' +
        '<button type="button" class="secondary small" data-story="' + esc(id) + '" data-act="stop">Stop</button>' +
      '</div>' +
      (noTimelineReason ? '<p class="note warn">' + esc(noTimelineReason) + '</p>' : '') +
      '<div class="story-notes small muted" id="' + esc(id) + '-notes"></div>' +
    '</div>';
  }
  function mountStory(spec) {
    widgets[spec.id] = spec;
    var canvas = A.$(spec.id + '-canvas');
    if (!canvas) return;
    fitCanvas(canvas);
    var tl = timelineOf(spec);
    var notes = A.$(spec.id + '-notes');
    if (notes) notes.innerHTML = tl && !tl.error ? '<p>Anchor: ' + esc(tl.originLabel) + '. Timeline ' + tl.tMin.toFixed(2) + ' s to ' + tl.tMax.toFixed(2) + ' s from the anchor.</p>' +
      (tl.summary ? '<p class="warn">' + esc(tl.summary) + '</p>' : '') +
      '<details><summary>Scenes and events (from the data)</summary><ul class="plain">' +
      tl.segments.filter(function (s) { return !s.skipped; }).map(function (s) { return '<li>' + esc(s.label) + ': ' + s.t0.toFixed(2) + ' to ' + s.t1.toFixed(2) + ' s' + (s.f0 != null ? ' (frames ' + s.f0 + '-' + s.f1 + ')' : '') + '</li>'; }).join('') +
      tl.events.map(function (e) { return '<li class="ev">' + esc(e.label) + ': ' + e.t.toFixed(2) + (e.t1 != null ? ' to ' + e.t1.toFixed(2) : '') + ' s</li>'; }).join('') +
      '</ul>' + tl.notes.map(function (n) { return '<p class="small">' + esc(n) + '</p>'; }).join('') + '</details>' : (tl && tl.error ? '<p class="warn">' + esc(tl.error) + '</p>' : '');
    drawIdle(spec);
  }
  function fitCanvas(canvas) {
    var w = Math.max(280, Math.min(720, (canvas.parentNode && canvas.parentNode.clientWidth) || 360));
    var dpr = root.devicePixelRatio || 1;
    canvas.style.width = w + 'px'; canvas.style.height = Math.round(w * 0.92) + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * 0.92 * dpr);
  }
  function timelineOf(spec) {
    if (spec._tl !== undefined) return spec._tl;
    try { spec._tl = spec.timeline(); } catch (e) { spec._tl = { error: A.errMsg(e) }; }
    return spec._tl;
  }
  function drawIdle(spec) {
    var canvas = A.$(spec.id + '-canvas'), tl = timelineOf(spec);
    if (!canvas || !tl || tl.error) return;
    Story.draw(canvas, tl, tl.tMin, { gameName: spec.gameName, clockText: 'idle', anchorT: 0 });
  }
  function play(spec, mode) {
    var tl = timelineOf(spec);
    if (!tl || tl.error) { A.log('storyboard: no timeline (' + (tl && tl.error) + ')'); if (mode === 'preview') return; }
    Cue.arm();
    var prog;
    try { prog = spec.program(mode); } catch (e) { A.reportError('cue program: ' + A.errMsg(e)); return; }
    var canvas = A.$(spec.id + '-canvas');
    var lead = mode === 'preview' && tl && !tl.error ? Math.max(0, -tl.tMin) + (spec.previewLead == null ? 0.5 : spec.previewLead) : 0;
    var endT = tl && !tl.error ? Math.max(prog.endT, tl.tMax + 0.5) : prog.endT;
    var p = Cue.program({ cues: prog.cues, visuals: prog.visuals, endT: endT, clock: prog.clock, leadS: lead, label: prog.label,
      onTick: function (t, v) {
        if (canvas && tl && !tl.error) Story.draw(canvas, tl, t, { gameName: spec.gameName, overlay: v, clockText: 'T' + (t >= 0 ? '+' : '') + t.toFixed(2) + ' s  ' + (prog.clock ? prog.clock(t) : ''), anchorT: 0 });
        var clk = A.$('runclock'); if (clk) clk.textContent = 'T' + (t >= 0 ? '+' : '') + t.toFixed(2) + ' s   ' + (prog.clock ? prog.clock(t) : '');
        if (spec.onTick) spec.onTick(t);
      },
      onEnd: function () { if (spec.onEnd) spec.onEnd(mode); drawIdle(spec); } });
    var lbl = A.$('runlabel'); if (lbl) lbl.textContent = (mode === 'preview' ? 'PREVIEW: ' : '') + (prog.label || '');
    Cue.start(p);
    if (spec.onStart) spec.onStart(mode);
  }
  function onStoryClick(btn) {
    var spec = widgets[btn.getAttribute('data-story')];
    if (!spec) return;
    var act = btn.getAttribute('data-act');
    if (act === 'stop') stopAll(); else play(spec, act);
  }

  // ---- the correction / calibration block (Gen 1 and Gen 2 timed modes) ------------------------------
  // The engine's recommendation (ShinyGen1Tid.recommendation) classifies the samples as few / setup / press / anchor /
  // tight; its sentence is written for RNG Solution's CLI ('train', --dual-anchor, calibrate --drop-last), none of which
  // exists here, so each kind is put in this page's own words with the engine's numbers. 'setup' is the drift call, which
  // the drift line below already prints with the engine's reason; 'press' needs a press-trainer measurement the page does
  // not take (pressSdMs is null here), so it cannot occur.
  // unitLabel names what frameMs is for the caller ('a frame' for Gen 1; Gen 2 passes its poll bin), and the P(hit)
  // printed here is the same headline figure the block prints above it (phase-averaged under 5 samples), never a
  // second estimate beside it.
  function adviceText(G1, kind, stats, drift, frameMs, unitLabel) {
    var n = stats.n, s = stats.sdMs, unit = unitLabel || 'a frame';
    var weak = drift && drift.strength === 'weak' ? ' (The last samples sit a frame from the earlier ones but within their scatter; keep an eye on it, it is not a drift call.)' : '';
    if (kind === 'few') return n + ' sample' + (n === 1 ? '' : 's') + ': no spread yet. Record 2 attempts for a first sd, 3 or more to trust it.';
    if (kind === 'setup') return null;
    var p = G1.hitProbabilityHeadline(s, n, frameMs).p, pct = A.pct(p);
    if (kind === 'anchor') return 'The spread (' + G1.pyFixed(s, 1) + ' ms) is wider than ' + unit + ': P(hit) ' + pct + '. This page has no press trainer, so it cannot tell your A press from your anchor tap: use the menu anchor if you are not already on it, practise the press, and keep recording. sd ' + G1.pyFixed(G1.sdForProbability(0.5, frameMs), 1) + ' ms would give 50 %.' + weak;
    if (kind === 'tight') return 'Tight: sd ' + G1.pyFixed(s, 1) + ' ms is within ' + unit + ' (P(hit) ' + pct + '). Keep recording; every sample sharpens the mean, and a drift is flagged here if the setup moves.' + weak;
    return null;
  }
  // key: the store key (platform + anchor), methId: only samples under this methodology count, defaultMs: the data's default
  function calibrationHtml(id, key, methId, defaultMs, frameMs, gotHint, unitLabel) {
    var G1 = A.G1, c = A.cal(key), split = G1.splitByMethodology(c.samples, methId), mine = split.kept;
    var meanCorr = G1.meanCorrection(mine, defaultMs), correction = c.override != null ? c.override : meanCorr;
    var stats = G1.anchorStats(mine), drift = G1.drift(mine.map(function (s) { return s.implied_ms; }));
    var haveSd = stats.n >= 2 && stats.sdMs === stats.sdMs;
    var headline = haveSd ? G1.hitProbabilityHeadline(stats.sdMs, stats.n, frameMs) : null;
    var rec = G1.recommendation(stats, drift, frameMs, null, false);
    var advice = adviceText(G1, rec[0], stats, drift, frameMs, unitLabel);
    var h = '<div class="calib" id="' + esc(id) + '">';
    h += '<p><span class="lbl">Correction in force:</span> <b>' + A.fmtMs(correction) + '</b>' + (c.override != null ? ' (your override; the mean of your samples is ' + A.fmtMs(meanCorr) + ')' : mine.length ? ' (mean of ' + mine.length + ' sample' + (mine.length === 1 ? '' : 's') + ')' : ' (the data\'s default for this anchor; no samples yet)') + '.</p>';
    h += '<div class="row"><label class="field">Override (ms, blank = use the mean)<input type="number" step="1" id="' + esc(id) + '-override" value="' + (c.override != null ? c.override : '') + '"></label>' +
      '<button type="button" class="secondary small" data-cal="' + esc(id) + '" data-act="override">Set</button><button type="button" class="secondary small" data-cal="' + esc(id) + '" data-act="clear-override">Clear</button></div>';
    // headline is the engine's {p, centred}: print the percentage and the same qualifier the site prints
    if (haveSd) h += '<p class="small">Spread of your implied corrections: sd ' + A.fmtMs(stats.sdMs) + ' over ' + stats.n + ' samples. ' + (headline ? 'P(hit): ' + A.pct(headline.p) + (headline.centred ? ' (centred on the frame)' : ' (phase-averaged: fewer than 5 samples)') + '.' : '') + '</p>';
    if (advice) h += '<p class="small muted">' + esc(advice) + '</p>';
    if (drift && drift.flag) h += '<p class="small warn">Drift: RECALIBRATE / SETUP CHANGED (' + esc(drift.strength) + '): ' + esc(drift.reason) + '.</p>';
    h += '<h3>What did you get?</h3><p class="small muted">' + esc(gotHint) + '</p>';
    h += '<div class="row"><label class="field">Trainer ID you got (decimal or $hex)<input type="text" inputmode="text" id="' + esc(id) + '-got" placeholder="16387 or $4003"></label>' +
      '<span class="calextra" id="' + esc(id) + '-extra"></span>' +
      '<button type="button" class="small" data-cal="' + esc(id) + '" data-act="submit">Record</button></div>';
    h += '<div id="' + esc(id) + '-msg" class="msg">' + (calMsgs[id] || '') + '</div>';
    if (mine.length) h += '<details><summary>Samples under this methodology (' + mine.length + ')</summary><ul class="plain small">' + mine.map(function (s) { return '<li>' + A.fmtTid(s.tid) + ': aimed ' + s.aimed + ', hit ' + s.hit + ', used ' + A.fmtMs(s.correction_used_ms) + ' -> implied ' + A.fmtMs(s.implied_ms) + '</li>'; }).join('') + '</ul>' +
      '<button type="button" class="secondary small" data-cal="' + esc(id) + '" data-act="drop-last">Drop the last sample</button> <button type="button" class="secondary small" data-cal="' + esc(id) + '" data-act="clear">Clear all</button></details>';
    if (split.rest.length) h += '<p class="small muted">' + split.rest.length + ' sample' + (split.rest.length === 1 ? '' : 's') + ' in this store were taken under another methodology and are not averaged.</p>';
    h += '</div>';
    return h;
  }
  var calHandlers = {}, calMsgs = {};   // calMsgs: the last "what did you get" answer per widget, kept across the re-render a recorded sample causes
  // handlers: {key, methId, defaultMs, onChange(), submit(text, force) -> {lines, forceable}}
  function bindCalibration(id, handlers) { calHandlers[id] = handlers; }
  function onCalClick(btn) {
    var id = btn.getAttribute('data-cal'), h = calHandlers[id];
    if (!h) return;
    var act = btn.getAttribute('data-act'), c = A.cal(h.key), G1 = A.G1;
    if (act === 'override') { var v = A.$(id + '-override').value.trim(); A.setCal(h.key, { samples: c.samples, override: v === '' || isNaN(Number(v)) ? null : Number(v) }); }
    else if (act === 'clear-override') A.setCal(h.key, { samples: c.samples, override: null });
    else if (act === 'drop-last') A.setCal(h.key, { samples: G1.dropLastUnder(c.samples, h.methId).rest, override: c.override });
    else if (act === 'clear') { A.setCal(h.key, { samples: c.samples.filter(function (s) { return s.methodology !== h.methId; }), override: c.override }); delete calMsgs[id]; }
    else if (act === 'submit' || act === 'force') {
      var text = A.$(id + '-got').value, msgEl = A.$(id + '-msg');
      var res = h.submit(text, act === 'force');
      var msgHtml = res.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + (res.forceable ? '<button type="button" class="secondary small" data-cal="' + esc(id) + '" data-act="force">Add anyway</button>' : '');
      if (msgEl) msgEl.innerHTML = msgHtml;
      if (!res.recorded) return;
      calMsgs[id] = msgHtml;
      if (A.$(id + '-got')) A.$(id + '-got').value = '';
    }
    if (h.onChange) h.onChange();
  }

  A.widgets = { storyWidgetHtml: storyWidgetHtml, mountStory: mountStory, onStoryClick: onStoryClick, stopAll: stopAll, calibrationHtml: calibrationHtml, bindCalibration: bindCalibration, onCalClick: onCalClick, refit: function () { Object.keys(widgets).forEach(function (k) { var c = A.$(k + '-canvas'); if (c) { fitCanvas(c); drawIdle(widgets[k]); } }); }, reset: function () { widgets = {}; calHandlers = {}; }, clearCalMsgs: function () { calMsgs = {}; } };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
