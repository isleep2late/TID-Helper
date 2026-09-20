// TID Helper page: the cue engine. Every tone is scheduled on the AudioContext clock and every visual (the flash
// overlay, the storyboard canvas) is drawn from that same clock inside requestAnimationFrame; nothing here runs on
// setTimeout. The AudioContext is created on a user gesture (arm(), called from the anchor / preview buttons); when
// it cannot be created the page posts {type:'audio-unavailable'} once and runs the visuals on performance.now().
// Ported from the site's cue runner (src/app/rng-solution/shared.tsx) and the owner's phone cue (manip-cue.html);
// the schedules it plays come from the data-driven engines (ShinyGen1Tid / ShinyGen2Tid / the R/S engine), never
// from constants here. UMD: the pure parts (visualsFor, program) run under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperCue = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  var A_HOLD_S = 3.0;          // how long the green "A!" stays up when the press is a hold (Gen 1)
  var A_TAP_S = 0.6;           // Gen 2: a 4-8 frame tap, so a short flash
  var VISUAL = {
    count: { text: function (c) { return c.label.replace('count-', ''); }, cls: 'v-white', durS: 0.3 },
    A: { text: function () { return 'A!'; }, cls: 'v-green', durS: A_HOLD_S },
    hold: { text: function () { return 'HOLD START'; }, cls: 'v-blue', durS: 0.5 },
    // 'keep' is a step where the right action is to CHANGE NOTHING - carry on holding what is already held, or
    // touch nothing at all. It exists because the Gen 1 buffer guide was sounding a press tone on exactly those
    // steps: hop0 straight after gfskip is the Game Freak skip still being held, and a new press there moves the
    // Trainer ID. A cue that says "now" on a do-nothing step is worse than no cue, so this one says what to keep
    // doing and is given a tone of its own by the caller.
    keep: { text: function (c) { return c.label; }, cls: 'v-blue', durS: 0.8 },
    // 'rolled' is an event, not an instruction: the frame the Trainer ID is written to memory, with nothing on
    // screen and nothing for the runner to do. The Gen 1 buffer guide marked it with the same 990 Hz tone and the
    // same amber flash as every press in the route, which is the one thing a marker for "it is over" must not
    // look or sound like.
    rolled: { text: function () { return 'ID rolled'; }, cls: 'v-white', durS: 0.6 },
    menu: { text: function () { return 'MENU'; }, cls: 'v-amber', durS: 0.3 },
    reset: { text: function () { return 'RESET'; }, cls: 'v-red', durS: 0.3 },
    abeat: { text: function () { return 'A'; }, cls: 'v-green', durS: 0.3 },
    power: { text: function () { return 'POWER OFF'; }, cls: 'v-red', durS: 0.3 },
    press: { text: function (c) { return c.label; }, cls: 'v-white', durS: 0.3 },
    'press-last': { text: function () { return 'A!'; }, cls: 'v-green', durS: 1.0 },
    mark: { text: function (c) { return c.label; }, cls: 'v-amber', durS: 0.4 }
  };
  function visualsFor(cues, aHoldS) {
    var out = [];
    (cues || []).forEach(function (c) {
      var v = VISUAL[c.kind];
      if (v) out.push({ t: c.t, durS: c.kind === 'A' ? (aHoldS == null ? A_HOLD_S : aHoldS) : v.durS, text: v.text(c), cls: v.cls, kind: c.kind });
    });
    return out;
  }
  // a program: what start() plays. cues [{t,freq,ms,label,kind}] (seconds from the anchor), visuals, endT, clock(t) -> text,
  // leadS: the visuals begin leadS BEFORE the anchor (preview: t runs from -leadS so the storyboard shows the boot before the menu)
  function program(spec) {
    if (!spec || !Array.isArray(spec.cues)) throw new Error('program needs cues');
    var endT = spec.endT;
    if (typeof endT !== 'number') { endT = 0; spec.cues.forEach(function (c) { endT = Math.max(endT, c.t + c.ms / 1000 + 0.5); }); }
    return { cues: spec.cues.slice(), visuals: spec.visuals || visualsFor(spec.cues), endT: endT, clock: spec.clock || function () { return ''; },
      leadS: spec.leadS || 0, onTick: spec.onTick || null, onEnd: spec.onEnd || null, label: spec.label || '' };
  }

  var Cue = {
    A_HOLD_S: A_HOLD_S, A_TAP_S: A_TAP_S, VISUAL: VISUAL, visualsFor: visualsFor, program: program,
    ctx: null, audioErr: null, audioReported: false, armed: false, running: false, run: null, nodes: [], raf: 0, missed: 0,
    latencyMs: 0, lastKey: '', onOverlay: null, onState: null, wake: null, visualOffsetMs: 0, sound: true
  };
  function outputLatencyS(c) { var l = c.outputLatency || c.baseLatency || 0; return isFinite(l) && l > 0 ? l : 0; }
  function nowS() { return Cue.ctx ? Cue.ctx.currentTime : (root.performance ? root.performance.now() / 1000 : Date.now() / 1000); }
  function postAudioUnavailable(reason) {
    Cue.audioErr = reason;
    if (Cue.audioReported) return;
    Cue.audioReported = true;
    try { if (root.TidHelperApp) root.TidHelperApp.post({ type: 'audio-unavailable', reason: reason, message: 'Audio cues are not available here (' + reason + '); the visual cues and the storyboard still run; on a computer, FlowTimer (Gen 1-2) or EonTimer (Gen 3-5) gives the same beeps.' }); } catch (e) { /* no app */ }
  }
  // arm(): on a user gesture. Creates the AudioContext, resumes it, plays a one-sample silent buffer (the unlock on phones).
  function arm() {
    try {
      if (!Cue.ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) throw new Error('no AudioContext in this WebView');
        Cue.ctx = new AC();
      }
      var c = Cue.ctx;
      if (c.state !== 'running' && typeof c.resume === 'function') { try { c.resume(); } catch (e) { /* resumed below */ } }
      var src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate);
      src.connect(c.destination);
      src.start();
      Cue.armed = true;
      Cue.latencyMs = Math.round(1000 * outputLatencyS(c));
      Cue.audioErr = null;
    } catch (err) {
      Cue.ctx = null; Cue.armed = false;
      postAudioUnavailable(err && err.message ? err.message : String(err));
    }
    if (Cue.onState) Cue.onState();
    return Cue.armed;
  }
  function beepAt(c, at, freq, durMs) {
    var osc = c.createOscillator(), gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(gain); gain.connect(c.destination);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.35, at + 0.004);
    gain.gain.setValueAtTime(0.35, Math.max(at + 0.005, at + durMs / 1000 - 0.006));
    gain.gain.linearRampToValueAtTime(0, at + durMs / 1000);
    osc.start(at); osc.stop(at + durMs / 1000 + 0.02);
    Cue.nodes.push(osc);
  }
  function activeVisual(run, t) {
    var lat = Cue.ctx ? outputLatencyS(Cue.ctx) : 0, best = null;
    for (var i = 0; i < run.visuals.length; i++) { var v = run.visuals[i]; if (t >= v.t + lat && t < v.t + lat + v.durS) best = v; }
    return best;
  }
  function tick() {
    var run = Cue.run;
    if (!run || !run.running) return;
    var t = nowS() - run.t0 + Cue.visualOffsetMs / 1000;
    var v = activeVisual(run, t);
    var key = v ? v.t + ':' + v.text : '';
    if (key !== Cue.lastKey) { Cue.lastKey = key; if (Cue.onOverlay) Cue.onOverlay(v); }
    if (run.onTick) { try { run.onTick(t, v, run); } catch (e) { run.tickError = e; } }
    if (t > run.endT) { finish(true); return; }
    Cue.raf = root.requestAnimationFrame(tick);
  }
  function finish(fireEnd) {
    var run = Cue.run;
    if (run) run.running = false;
    if (Cue.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(Cue.raf);
    Cue.raf = 0;
    Cue.nodes.forEach(function (n) { try { n.stop(); } catch (e) { /* already stopped */ } });
    Cue.nodes = [];
    Cue.lastKey = '';
    Cue.running = false;
    if (Cue.onOverlay) Cue.onOverlay(null);
    if (Cue.wake) { try { Cue.wake.release(); } catch (e) { /* released */ } Cue.wake = null; }
    if (Cue.onState) Cue.onState();
    if (fireEnd && run && run.onEnd) { try { run.onEnd(run); } catch (e) { /* ignore */ } }
  }
  // start(program): the anchor is NOW (the tap); tones at t0 + cue.t; t counts from the anchor (negative during a preview lead-in)
  function start(prog) {
    if (Cue.run && Cue.run.running) finish(false);
    if (!Cue.armed && !Cue.audioErr) arm();
    var c = Cue.ctx;
    var t0 = nowS() + (prog.leadS || 0);
    var miss = 0;
    if (c && Cue.sound) {
      prog.cues.forEach(function (cue) {
        var at = t0 + cue.t;
        if (at >= c.currentTime + 0.002) beepAt(c, at, cue.freq, cue.ms); else miss++;
      });
    }
    Cue.missed = miss;
    Cue.latencyMs = c ? Math.round(1000 * outputLatencyS(c)) : 0;
    Cue.run = { cues: prog.cues, visuals: prog.visuals, endT: prog.endT, clock: prog.clock, onTick: prog.onTick, onEnd: prog.onEnd, label: prog.label, t0: t0, running: true, leadS: prog.leadS || 0 };
    Cue.running = true;
    Cue.lastKey = '';
    try { if (root.navigator && root.navigator.wakeLock) root.navigator.wakeLock.request('screen').then(function (s) { Cue.wake = s; }).catch(function () { /* no wake lock */ }); } catch (e) { /* no wake lock */ }
    if (Cue.onState) Cue.onState();
    tick();
    return Cue.run;
  }
  function stop() { finish(false); }
  function elapsed() { return Cue.run && Cue.run.running ? nowS() - Cue.run.t0 + Cue.visualOffsetMs / 1000 : null; }

  Cue.arm = arm; Cue.start = start; Cue.stop = stop; Cue.elapsed = elapsed; Cue.nowS = nowS; Cue.activeVisual = activeVisual;
  return Cue;
});
