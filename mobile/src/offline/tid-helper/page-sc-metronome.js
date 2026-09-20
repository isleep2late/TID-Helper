// TID Helper page: the SAVE CORRUPTER METRONOME ("SC Metronome").
//
// WHAT IT IS. The save-corruption trick asks for two actions a fixed distance apart - on a Game Boy
// Player that is RESET then A about 0.2 s later - and the thing a player has to own is the GAP, not a
// number on a screen. So this plays the gap, over and over, until the hand knows it.
//
// WHY IT IS NOT A PLAIN TICK. "Repeat the interval forever" read literally gives an even tick where every
// gap is the same, and that is the wrong rhythm to learn: the attempt is a PAIR (RESET, then A) and then a
// long wait before the next attempt. An even tick teaches tap-tap-tap-tap, which the trick never asks for.
// The default is therefore pair - gap - pair, with the attempt cadence on its own control, and an even
// tick available for anyone who wants to drill the bare interval.
//
// WHY IT DOES NOT SHIP ONE BLESSED NUMBER. The presets come from this project's own emulator harness and
// the harness is honest about what it rests on: the Game Boy Player fade is gambatte-speedrun's community
// constant, not a hardware measurement, and it has been 33, 37 and ~35.7 frames in that project's history.
// The engine's per-platform reset_status carries that. A preset is therefore a STARTING POINT and the app
// says so; the number that matters is the one the player measures off their own successful attempt.
//
// WHERE THE MATHS LIVES. Nothing here re-derives a window. The interval, its order and both windows come
// from the shipped engine (A.G1.resetInterval over the data's reset model) - the same call the Gen 1 timed
// page's metronome card makes, so neither can drift from the other's ARITHMETIC. They can still show
// different numbers at the same moment, and that is not a bug to hide: they keep separate preferences, so
// the platform and save path picked here are this tool's own, and this tool does not expose the card's
// free 'adjust (frames)' field. Same engine, same inputs, same answer. What is new here is the
// loop, the capture, and the flashing, none of which the cue engine can do:
//
//   - the cue engine PRE-SCHEDULES a finite program and ends (page-cue.js start/finish), so restarting it
//     from onEnd loses or lengthens a beat every cycle. This runs a rolling look-ahead scheduler instead:
//     every tick is placed at an absolute t0 + n*period on the AudioContext clock, never t += period.
//   - capture reads the CLICK event's timeStamp. The page registers click, input and change and nothing
//     else, so there is no pointerdown to read; timeStamp is still stamped when the event is created
//     rather than when the handler finally runs, which is the part worth having. A click fires on
//     release, so the run is release-to-release - consistent between the two taps, so the INTERVAL is
//     unaffected even though each stamp sits later than the finger going down. It takes the MEDIAN of at
//     least three samples of the interval, because with two one bad tap IS the answer, and it drops a run
//     after a five second pause rather than letting a stale first tap drag the median. Which gaps are
//     samples of the interval depends on the rhythm being tapped, and that is the whole of capture(): see
//     the comment on it.
//   - the flash is off until asked for, under its own preference key, and rate-limited in code.
//
// UMD: the pure part (capture statistics, the flash plan, the beat pattern) runs under node for the tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperScMetronome = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';

  var FRAME_MS = 1000 / 59.727500569605804;   // one Game Boy frame; every nudge here is a whole one of these

  // ---- pure: what the beat looks like -----------------------------------------------------------------

  // One attempt as a list of beat offsets in seconds, labelled with what the player does on each.
  // 'pair' is the real rhythm: the two actions intervalMs apart, then silence until the next attempt.
  // 'even' is the bare interval repeated, for drilling the gap alone.
  // The smallest interval this will play. Below it the look-ahead loop would place hundreds of tones per
  // tick and the tab would stop answering, and no save-corruption timing is near it anyway - the whole
  // Gen 1 window is 67 ms. Typing 0.2 into the ms field meaning 0.2 s is the slip this catches.
  var MIN_INTERVAL_MS = 20, MAX_INTERVAL_MS = 60000;
  function clampInterval(ms) { return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Number(ms) || MIN_INTERVAL_MS)); }

  function pattern(mode, intervalMs, cadenceS, order) {
    var iv = clampInterval(intervalMs) / 1000;
    if (mode === 'even') return { periodS: iv, beats: [{ t: 0, label: order[0] + ' / ' + order[1], lead: true }] };
    var period = Math.max(cadenceS, iv + 0.1);   // an attempt can never be shorter than the pair inside it
    return { periodS: period, beats: [{ t: 0, label: order[0], lead: true }, { t: iv, label: order[1], lead: false }] };
  }

  // The worst case number of flashes in ANY one-second window of the repeating pattern. This is the
  // quantity WCAG 2.3.1 is written in terms of ("no more than three flashes in any one-second period"),
  // and it is NOT 1/gap: a pair puts two flashes close together and then waits, so the burst is what counts.
  function flashesPerSecond(pat) {
    var ts = [], n, i;
    var reps = Math.max(2, Math.ceil(2 / Math.max(pat.periodS, 0.001)) + 2);
    for (n = 0; n < reps; n++) for (i = 0; i < pat.beats.length; i++) ts.push(n * pat.periodS + pat.beats[i].t);
    ts.sort(function (a, b) { return a - b; });
    var worst = 0;
    for (i = 0; i < ts.length; i++) {
      var c = 0;
      // <= and not <: WCAG counts flashes in ANY one-second period, which includes both ends. A strict
      // < drops a beat landing exactly on the far edge - which is every period that divides a second,
      // 1000 ms, 500 ms, 250 ms, and those are exactly the round numbers a person types.
      for (var j = i; j < ts.length; j++) if (ts[j] <= ts[i] + 1.0 + 1e-9) c++;
      if (c > worst) worst = c;
    }
    return worst;
  }

  // What the visual beat is allowed to be, decided from the pattern rather than from a checkbox.
  //
  // WCAG 2.3.1 (Level A) is a hard ceiling of three flashes in any one second, and its own Understanding
  // text says letting the user switch the flashing off is NOT a mitigation, "since the seizure could occur
  // faster than most users could turn it off" - which is why the decision is made here, in code, and why
  // the flash starts off. The small-indicator escape is the standard one: the general flash threshold
  // applies to a "large" area of screen, so a small, low-contrast, non-red indicator is outside it at any
  // rate. The area cap is a conservative design budget, not a measured conformance number.
  function flashPlan(pat) {
    var fps = flashesPerSecond(pat);
    if (fps > 3) return { allowed: 'indicator', fps: fps, reason: 'This pattern would flash ' + fps + ' times in one second. Three in any one second is the limit (WCAG 2.3.1), so a full-screen flash is refused here and a small indicator is used instead.' };
    var minGap = minGapS(pat);
    if (minGap < 0.5) return { allowed: 'indicator', fps: fps, reason: 'The two actions are only ' + Math.round(minGap * 1000) + ' ms apart. That is inside the limit for count, but too fast to put across the whole screen, so a small indicator is used.' };
    return { allowed: 'fullscreen', fps: fps, reason: 'Gaps of at least half a second and no more than three flashes in any one second.' };
  }

  function minGapS(pat) {
    var ts = [], n, i;
    for (n = 0; n < 3; n++) for (i = 0; i < pat.beats.length; i++) ts.push(n * pat.periodS + pat.beats[i].t);
    ts.sort(function (a, b) { return a - b; });
    var m = Infinity;
    for (i = 1; i < ts.length; i++) m = Math.min(m, ts[i] - ts[i - 1]);
    return m;
  }

  // ---- pure: capture ----------------------------------------------------------------------------------

  // How many taps a run needs before it is allowed to say anything. Three samples of the interval is the
  // fewest that survives one slip - with two, one unlucky tap IS the answer - and in the pair rhythm only
  // every other gap is a sample, so the pair rhythm has to be tapped twice as long to collect three.
  function minTaps(mode) { return mode === 'pair' ? 6 : 4; }

  function tapsReason(mode) {
    return mode === 'pair'
      ? 'Tap at least ' + minTaps(mode) + ' times: in the pair rhythm only every other gap is the interval, so ' + minTaps(mode) + ' taps is what gives three of them.'
      : 'Tap at least ' + minTaps(mode) + ' times: two taps is a single gap, and one slip becomes the answer.';
  }

  // The interval a run of taps says, as the median of the gaps that ARE the interval, with the spread over
  // those same gaps so the player can see whether their own tapping was steady enough to believe.
  //
  // WHICH GAPS ARE THE INTERVAL, and why this is not a plain median. In 'pair' the player taps an attempt -
  // the two actions intervalMs apart - and then waits out the rest of it, so the gaps ALTERNATE: interval,
  // wait, interval, wait. A median over all of them is not the interval and never was. At the shipped
  // gbp-fade / route preset (199.2 ms) paced at the data's own reset_cadence_s the two gaps are 199.2 ms
  // and 1800.8 ms, and the median came back 1000.0 ms - just over five times the interval - on every odd
  // tap count, or 1800.8 ms (nine times) on an even one when the run had started on the second action. It
  // was right only when the tap count was EVEN and the first tap was the first action - one case in four -
  // and the card pinned neither half of that: "at least four taps" happens to land in the right case, five
  // taps does not, and nothing told the player which of the two actions to start on.
  //
  // The run is anchored by the instruction the card now gives: the first tap is the FIRST action of an
  // attempt, so the interval is the gaps at even positions and the wait is the gaps at odd ones. A tap
  // dropped mid-run breaks that alternation instead of quietly biasing the answer, and the spread - shown
  // in frames beside the number - is what makes that visible. In 'even' every gap is the interval.
  //
  // The wait comes back too, as waitMs. Anchoring on the first tap means a run that STARTED on the second
  // action returns the two numbers the wrong way round, and nothing else on the card would show it: the
  // spread stays tiny because a steady run of wait gaps is just as steady as a run of interval gaps.
  // Which of the two is the interval is not something this can decide - the pattern only guarantees that
  // an attempt is at least the pair plus a margin, so at a tight cadence the interval really is the longer
  // gap - so both are reported and the player is told which way round they should be.
  function median(sorted) {
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function capture(stamps, mode) {
    if (!stamps || stamps.length < 2) return { ok: false, taps: stamps ? stamps.length : 0, gaps: [], intervalGaps: [], waitGaps: [], waitMs: null, reason: tapsReason(mode) };
    var gaps = [], used = [], waits = [], i;
    for (i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
    for (i = 0; i < gaps.length; i++) { if (mode !== 'pair' || i % 2 === 0) used.push(gaps[i]); else waits.push(gaps[i]); }
    var sorted = used.slice().sort(function (a, b) { return a - b; });
    var spread = sorted[sorted.length - 1] - sorted[0];
    return {
      // In the pair rhythm the estimator takes every OTHER gap, which is the interval only if the run started on
      // the first of the two actions. Starting on the second gives the wait between attempts instead - the same
      // taps, read a beat out. The wait is always the longer of the two, so when they come back the wrong way
      // round the run is misread, and that is said outright rather than left as two numbers to compare.
      misordered: waits.length > 0 && median(waits.slice().sort(function (a, b) { return a - b; })) < median(sorted),
      ok: used.length >= 3, taps: stamps.length, gaps: gaps, intervalGaps: used, waitGaps: waits,
      medianMs: median(sorted), spreadMs: spread, spreadFrames: spread / FRAME_MS,
      waitMs: waits.length ? median(waits.slice().sort(function (a, b) { return a - b; })) : null,
      reason: used.length >= 3 ? null : tapsReason(mode)
    };
  }

  // A millisecond value moved by whole frames. Every correction anyone has ever needed on this trick is a
  // whole number of frames, so the nudge is a frame and not a round 10 ms that no frame ever lands on.
  function nudge(ms, frames) { return ms + frames * FRAME_MS; }

  // WHICH WAY TO MOVE THE NUMBER when the reset landed too early - and it is NOT the same way on every
  // console, because the two reset models put the reset on opposite sides of the interval.
  //
  //   gbp-fade  order ["RESET","A"]        - the reset is FIRST. The console keeps running through a fade,
  //     so the reset instant lands at (fade - interval) into the save: waiting LONGER before A puts the
  //     reset EARLIER in the save. Too early therefore means the interval is too long -> SHORTEN it.
  //   power-off order ["A","POWER OFF"]    - the reset is SECOND. The power goes off at (interval) into
  //     the save, so waiting longer puts it LATER. Too early means the interval is too short -> LENGTHEN it.
  //
  // Getting this backwards would walk the player away from the window while telling them they were closing
  // in on it, so it is derived from the model's own order rather than written into the copy.
  function resetIsFirst(order) { return !!order && order.length === 2 && /reset/i.test(String(order[0])); }
  function correctionFrames(order, frames) { return resetIsFirst(order) ? -Math.abs(frames) : Math.abs(frames); }

  var pure = { FRAME_MS: FRAME_MS, MIN_INTERVAL_MS: MIN_INTERVAL_MS, clampInterval: clampInterval, pattern: pattern, flashesPerSecond: flashesPerSecond, flashPlan: flashPlan, minGapS: minGapS, capture: capture, minTaps: minTaps, nudge: nudge, resetIsFirst: resetIsFirst, correctionFrames: correctionFrames };

  // ---- UI ---------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'scmetro';
    var GEN1 = { red: 1, blue: 1, yellow: 1 }, GEN2 = { gold: 1, silver: 1, crystal: 1 };
    var state = { taps: [], run: null, timer: 0, raf: 0, overlay: null };

    // Preferences are keyed BY GAME. The mode serves six games and an interval is a fact about one
    // cartridge on one console: a number captured on Gold must never come back as Red's preset, and it did
    // while these were one section-wide key.
    function p(k, game, d) { return A.pref(SEC, k + '.' + game, d); }
    function set(k, game, v) { var o = {}; o[k + '.' + game] = v; A.setPref(SEC, o); }

    // THE ONE THING THAT MUST NEVER BE MISSED. The page tears a mode down by calling A.widgets.stopAll()
    // and rewriting #main - that stops the cue engine, which knows nothing about this loop. Left alone,
    // pressing Back walked away from a metronome that kept beeping, with a full-screen flash overlay still
    // parented to document.body and no Stop button anywhere on screen. Wrapping the shared stop means every
    // existing teardown path - Back, switching game or mode, the storyboard's own Stop - stops this too,
    // without editing a file this tool does not own.
    if (A.widgets && !A.widgets.__scmWrapped) {
      var innerStopAll = A.widgets.stopAll;
      A.widgets.stopAll = function () { try { stopLoop(); } catch (e) { } return innerStopAll.apply(this, arguments); };
      A.widgets.__scmWrapped = true;
    }

    function preset(game) {
      var g1 = A.D.gen1;
      if (!GEN1[game] || !g1) return null;
      var pk = p('platform', game, g1.defaults.platform);
      if (!g1.platforms[pk]) pk = g1.defaults.platform;
      var platform = g1.platforms[pk], rm = platform && g1.reset_models ? g1.reset_models[platform.reset] : null;
      if (!rm) return null;
      var path = p('path', game, 'route');
      if (!rm.paths[path]) path = Object.keys(rm.paths)[0];
      try { return { platformKey: pk, platform: platform, model: rm, path: path, ri: A.G1.resetInterval(rm, path, null, 0) }; }
      catch (e) { return null; }
    }

    function intervalMs(game) {
      var typed = p('intervalMs', game, null);
      if (typed != null && isFinite(typed) && typed > 0) return clampInterval(typed);
      var pr = preset(game);
      return pr ? pr.ri.centreMs : null;
    }

    // The order the two actions go in, from the model. Null when nothing models this game, and the caller
    // must then offer no direction at all rather than guessing one from a placeholder.
    function orderOf(game) { var pr = preset(game); return pr && pr.ri.order && pr.ri.order.length === 2 ? pr.ri.order.slice() : null; }
    function orderLabels(game) { return orderOf(game) || ['first action', 'second action']; }

    // One of exactly two rhythms, whatever is in the preference. capture() and the instruction under the
    // tap button both key off this, and they have to key off the same value or they disagree about which
    // gaps the player is being asked to produce.
    function modeOf(game) { return p('mode', game, 'pair') === 'even' ? 'even' : 'pair'; }

    // The attempt cadence's default is the data's own reset_cadence_s - the spacing the Gen 1 reset lists
    // are built at, and the number the timed page's reset card already prints - so a player drilling here
    // and a player working a list are pacing to the same second. It used to be a literal 2.0 written in
    // three places in this file; it agreed with the data by luck, and nothing would have caught it drifting.
    // Null when the data does not state one: pattern() then falls back to the tightest an attempt can be,
    // which is the pair plus its own margin, rather than to a number chosen here.
    function defaultCadenceS() {
      var g1 = A.D.gen1, v = g1 && g1.defaults ? Number(g1.defaults.reset_cadence_s) : NaN;
      return isFinite(v) && v > 0 ? v : null;
    }
    function cadenceS(game) {
      var v = Number(p('cadenceS', game, NaN));
      return isFinite(v) && v > 0 ? v : defaultCadenceS();
    }

    function patternNow(game) {
      var iv = intervalMs(game);
      if (iv == null) return null;
      return pattern(modeOf(game), iv, cadenceS(game), orderLabels(game));
    }

    // ---- the loop -------------------------------------------------------------------------------------
    var LOOKAHEAD_S = 0.15, TIMER_MS = 25;

    function beep(ctx, at, freq, durMs, gainTo) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.frequency.value = freq; osc.type = 'square';
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gainTo, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + durMs / 1000);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + durMs / 1000 + 0.02);
      return osc;
    }

    function removeOverlay() {
      if (state.overlay && state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay);
      state.overlay = null;
    }

    function addOverlay() {
      if (state.overlay) return;
      var ov = document.createElement('div');
      ov.className = 'scm-overlay';
      ov.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ov);
      state.overlay = ov;
    }

    // Said HERE rather than from the animation callback: a throttled or suspended rAF left the line reading
    // "Stopped." while the thing was audibly running. Shared with retime() so an adjustment cannot leave the
    // line describing the beat that stopped being played.
    function statusText(game, r) {
      return 'Running at ' + A.fmtMs(intervalMs(game)) + '. ' +
        (r.sound ? '' : 'Muted, so keep this tab in front - a silent page is throttled in the background. ') +
        (r.flash ? (r.plan.allowed === 'fullscreen' ? 'Full-screen flash.' : 'Small indicator (the pattern is too fast for the full screen).') : 'No flash.') +
        (r.animate ? '' : ' The indicator is not blinking: this pattern is above the flash limit.');
    }

    // The three things a run holds that are read off the preferences and the pattern rather than off the
    // clock. Kept together because startLoop and retime must agree on them; they used to be computed only
    // in startLoop, which is why an adjustment had to restart the whole loop to take effect.
    function applyPrefs(game, r, pat) {
      r.pat = pat;
      r.plan = flashPlan(pat);
      r.sound = p('sound', game, true) !== false;
      r.flash = !!p('flash', game, false) && !!p('flashConsent', game, false);
      // The INDICATOR is rate-limited too. It was the escape hatch for patterns too fast for the whole
      // screen, and it had no limit of its own: an even tick at 45 ms drove it at ~22 changes a second,
      // squarely in the band that provokes photosensitive seizures. Above the ceiling it stops animating
      // per beat and simply reads "running" - the beat is still audible, which is what the tool is for.
      r.animate = r.plan.fps <= 3;
      if (r.flash && r.plan.allowed === 'fullscreen') addOverlay(); else removeOverlay();
      if (!r.animate) { var dot = A.$('scm-dot'); if (dot) { dot.className = 'scm-dot'; dot.textContent = ''; } }
    }

    function stopLoop(quiet) {
      if (state.timer) { clearInterval(state.timer); state.timer = 0; }
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
      if (state.run && state.run.nodes) state.run.nodes.forEach(function (n) { try { n.stop(); } catch (e) { } });
      if (state.run && state.run.wake) { try { state.run.wake.release(); } catch (e) { } }
      state.run = null;
      removeOverlay();
      if (!quiet) setStatus('Stopped.');
      var dot = A.$('scm-dot'); if (dot) { dot.className = 'scm-dot'; dot.textContent = ''; }
    }

    function setStatus(text) { var st = A.$('scm-status'); if (st) st.textContent = text; }

    function startLoop(game) {
      stopLoop(true);
      var pat = patternNow(game);
      if (!pat) { setStatus('No interval yet: capture one or type one first.'); return; }
      A.Cue.arm();
      var ctx = A.Cue.ctx;
      if (!ctx) { setStatus('No audio on this device, so there is no beat to play.'); return; }
      if (ctx.state !== 'running' && ctx.resume) ctx.resume();

      var run = { t0: ctx.currentTime + 0.25, pat: pat, n: 0, nodes: [], sched: [], plan: null, flash: false, sound: true, animate: true, wake: null };
      state.run = run;
      applyPrefs(game, run, pat);

      if (root.navigator && navigator.wakeLock && navigator.wakeLock.request) {
        try { navigator.wakeLock.request('screen').then(function (w) { if (state.run === run) run.wake = w; else { try { w.release(); } catch (e) { } } }, function () { }); } catch (e) { }
      }

      setStatus(statusText(game, run));

      state.timer = setInterval(function () {
        var r = state.run; if (!r) return;
        var horizon = ctx.currentTime + LOOKAHEAD_S;
        while (r.t0 + r.n * r.pat.periodS <= horizon) {
          var base = r.t0 + r.n * r.pat.periodS;
          for (var i = 0; i < r.pat.beats.length; i++) {
            var b = r.pat.beats[i], at = base + b.t;
            // A beat whose moment has passed is DROPPED, never played late: playing it now would shorten
            // the gap the tool exists to teach. Losing one after a stall is the honest outcome.
            if (at < ctx.currentTime) continue;
            if (r.sound) r.nodes.push(beep(ctx, at, b.lead ? 660 : 990, b.lead ? 45 : 70, b.lead ? 0.20 : 0.30));
            r.sched.push({ at: at, label: b.label, lead: b.lead });
          }
          r.n++;
        }
        // prune only what is safely in the past for both the ear and the eye
        var cutoff = ctx.currentTime - 1.0;
        if (r.nodes.length > 128) r.nodes = r.nodes.slice(-64);
        if (r.sched.length > 128) r.sched = r.sched.filter(function (x) { return x.at > cutoff; });
      }, TIMER_MS);

      function frame() {
        var r = state.run; if (!r) return;
        state.raf = requestAnimationFrame(frame);
        if (!r.animate) return;
        var now = ctx.currentTime, hit = null;
        for (var i = 0; i < r.sched.length; i++) { var sc = r.sched[i]; if (now >= sc.at && now < sc.at + 0.09) hit = sc; }
        var dot = A.$('scm-dot');
        if (dot) { dot.className = 'scm-dot' + (hit ? (hit.lead ? ' on lead' : ' on second') : ''); dot.textContent = hit ? hit.label : ''; }
        if (state.overlay) state.overlay.className = 'scm-overlay' + (hit ? ' on' : '');
      }
      state.raf = requestAnimationFrame(frame);
    }

    // Anything that changes what the beat IS has to reach the beat. The run snapshots its pattern, so a
    // nudge used to move the number on screen while the ear kept the old gap - and worse, the card printed
    // a fresh flash plan while the overlay kept flashing under the old one.
    //
    // WHY THIS IS NOT startLoop AGAIN, which is what it used to be. Every adjustment ran
    // restartIfRunning() -> startLoop() -> stopLoop(true) and then returned 'render' from onEvent, and the
    // page renders a mode by calling A.widgets.stopAll() first - which this file WRAPS, on purpose, so that
    // Back can never leave a metronome beeping. So the re-render immediately stopped the loop that the
    // restart had just started: every adjustment ended the beat and left the status line reading "Stopped."
    // That safety net is not the thing to weaken, so the adjustments update the card in place instead of
    // re-rendering it, and the beat is re-timed rather than restarted.
    //
    // Re-timing keeps the PHASE. The scheduler has already committed every attempt whose start is inside
    // the look-ahead horizon, so the first attempt start it has not committed to - r.t0 + r.n * periodS -
    // is the earliest moment the new pattern can begin without either cancelling a beat already on the
    // audio clock or leaving a hole. The attempt already in flight finishes on the old timing; everything
    // after it is the new one. Nothing is re-anchored to "now", so the hand does not lose its place.
    function retime(game) {
      var r = state.run;
      if (!r) return;
      var pat = patternNow(game);
      if (!pat) { stopLoop(); return; }   // the interval was cleared and nothing models this game
      var wasSound = r.sound;
      r.t0 = r.t0 + r.n * r.pat.periodS;
      r.n = 0;
      applyPrefs(game, r, pat);
      // Muting has to be audible immediately. Up to a look-ahead of beeps are already on the audio clock
      // and would go on sounding after the box was unticked, so they are cancelled; r.sound alone only
      // governs what gets scheduled next.
      if (wasSound && !r.sound) { r.nodes.forEach(function (n) { try { n.stop(); } catch (e) { } }); r.nodes = []; }
      setStatus(statusText(game, r));
    }

    // ---- rendering ------------------------------------------------------------------------------------

    function disclosureHtml(game, pr) {
      var out = [];
      out.push('This is a practice aid, not a measurement of your console. Every number it starts you on came from an emulator model of one setup; yours will differ.');
      if (pr) {
        out.push('Preset source: ' + pr.model.description);
        out.push('This platform, in the data\'s own words: ' + pr.platform.reset_status + (pr.platform.validation ? ' - ' + pr.platform.validation : ''));
        out.push('The model behind every one of these numbers assumes a reset fade this project took from gambatte-speedrun, which is a community constant rather than a measurement of real hardware. That is the single biggest reason to trust your own recording over the preset.');
      }
      out.push('THE ORDER IS NOT THE SAME EVERYWHERE, and the app only claims the two it models: a Game Boy Player resets first and presses A after, while a handheld presses A first and then loses power. The Pokemon Speedrunning route notes also report that Game Boy Interface - the same GameCube, different software - wants A first and the reset right after; there is no GBI model here, so the app offers GBI no number and no order.');
      out.push('A GAMECUBE ACTS ON THE RELEASE OF RESET, not the push - this is the console\'s own reset behaviour and it is NOT part of the model above, which treats the reset as one instant. How long you hold the button is therefore your own unmodelled variable: hold it 80 ms longer and the reset moves about five frames, which is more than the whole window. Keep the hold the same every time.');
      out.push('THE IN-GAME BUTTON COMBO CANNOT DO THIS. In the Gen 1 decomp the A+B+START+SELECT reset is polled from the main loop and needs the combo held across several polls, and in Gen 2 input is ignored for the whole save; either way it cannot fire inside the window. It has to be a real reset: the GameCube RESET button, the reset on a Super Game Boy\'s console, a power cycle, or an emulator reset key.');
      out.push('The window itself is four frames wide (67 ms) between the mean first-checksum store and the mean first party byte, measured by this project\'s emulator harness. That is the room the RESET has to land in - it is NOT how much slack your press has.');
      if (pr) out.push('For this platform and path the app\'s own physical band is ' + A.fmtMs(pr.ri.physLoMs) + ' to ' + A.fmtMs(pr.ri.physHiMs) + ' (' + A.fmtMs(pr.ri.physHiMs - pr.ri.physLoMs) + ' wide), and the game reads the pad once a frame, so up to one frame of any attempt is luck no metronome can remove.');
      out.push('GET YOUR OWN NUMBER. Record yourself on an attempt that WORKS - a phone camera at 60 fps on your hands, or a capture card - and count the frames between the two actions, then type that in. That recording is the only thing here that is about YOUR setup. The app records nothing and asks for no camera or microphone.');
      return '<ul class="plain small">' + out.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
    }

    function gameName(game) {
      var g1 = A.D.gen1 && A.D.gen1.games && A.D.gen1.games[game];
      var g2 = A.D.gen2 && A.D.gen2.games && A.D.gen2.games[game];
      return (g1 && g1.name) || (g2 && g2.name) || game;
    }

    // WHAT THE PLAYER IS ASKED TO TAP, and it has to be the same thing capture() measures. This read "Tap
    // the button in time with the two actions - at least four taps", which describes neither rhythm: in
    // 'pair' the taps alternate interval, wait, interval, wait and four of them give only two samples of
    // the interval, while the arithmetic underneath was taking a median over the whole alternating run.
    // The instruction now names the rhythm's own two actions, says the wait is not tapped, and quotes the
    // tap count that rhythm actually needs.
    function tapHowText(game) {
      var mode = modeOf(game);
      if (mode !== 'pair') return 'Tap every tick: in the even rhythm every gap is the interval. At least ' + minTaps(mode) + ' taps.';
      var ord = orderLabels(game);
      return 'Tap both actions of each attempt - ' + ord.join(' then ') + ' - starting on ' + ord[0] + ' and leaving the wait between attempts untapped. At least ' + minTaps(mode) + ' taps.';
    }

    function capMsgText(game) {
      var mode = modeOf(game), cap = capture(state.taps, mode);
      if (!state.taps.length) return tapHowText(game);
      if (!cap.ok) return tapHowText(game) + ' (' + cap.taps + ' tap' + (cap.taps === 1 ? '' : 's') + ' so far)';
      var ord = orderLabels(game);
      if (cap.misordered) return 'This run started on ' + ord[1] + ' rather than ' + ord[0] + ': the gap read as the interval (' + A.fmtMs(cap.medianMs) + ') is longer than the one read as the wait between attempts (' + A.fmtMs(cap.waitMs) + '), and the wait is always the longer of the two. Clear the taps and start on ' + ord[0] + '.';
      return 'Interval ' + A.fmtMs(cap.medianMs) + ' from ' + cap.intervalGaps.length + ' gap' + (cap.intervalGaps.length === 1 ? '' : 's') + ', spread ' + A.fmtMs(cap.spreadMs) + ' (' + cap.spreadFrames.toFixed(1) + ' frames).' +
        (cap.waitMs == null ? '' : ' The wait between attempts came out ' + A.fmtMs(cap.waitMs) + '.') +
        ' Press "Use the tapped interval" to take it.';
    }

    function flashPlanText(game) {
      var pat = patternNow(game);
      return pat ? 'With the pattern as it stands: ' + flashPlan(pat).reason : '';
    }

    // Every part of the card that DERIVES from the interval, the cadence or the rhythm, written back into
    // the nodes already on screen. The adjustments used to return 'render' and let the page rebuild the
    // mode; that scrolled to the top, replaced the field under the caret, and - because the page's own
    // render() begins with the stopAll this file wraps - killed the beat. Writing the derived text back is
    // the same trick the tap button has used since it was written, applied to the rest of the card.
    // Field values are only written when they differ, so a commit that changed nothing leaves the caret be.
    function refresh(game) {
      var iv = intervalMs(game), cad = cadenceS(game), consent = !!p('flashConsent', game, false);
      var f = A.$('scm-interval');
      if (f) { var wantIv = iv == null ? '' : String(Math.round(iv * 10) / 10); if (f.value !== wantIv) f.value = wantIv; }
      var c = A.$('scm-cadence');
      if (c) { var wantCad = cad == null ? '' : String(cad); if (c.value !== wantCad) c.value = wantCad; }
      var fp = A.$('scm-flashplan'); if (fp) fp.textContent = flashPlanText(game);
      var cm = A.$('scm-capmsg'); if (cm) cm.textContent = capMsgText(game);
      var fc = A.$('scm-flash'); if (fc) fc.disabled = !consent;
      var fn = A.$('scm-flashnote'); if (fn) fn.textContent = consent ? '' : ' (read the warning first)';
    }

    // An adjustment: take it, re-time a beat that is playing, and repaint the card where it stands. The
    // 'render' this used to return was the teardown - see retime() - so nothing here returns it.
    function adjusted(game) { retime(game); refresh(game); return null; }

    function render(el, game) {
      var pr = preset(game), iv = intervalMs(game), ord = orderLabels(game);
      var g1 = A.D.gen1;
      var h = '<h2>SC Metronome: ' + esc(gameName(game)) + '</h2>';
      h += '<p class="small muted">A metronome for the save-corruption reset: it plays the gap between the two actions over and over so your hands learn it.</p>';

      var body = '';
      if (GEN1[game] && g1) body += A.choices('scm-platform', Object.keys(g1.platforms).map(function (k) { var pl = g1.platforms[k]; return { id: k, title: pl.name, sub: pl.reset_status || pl.status }; }), pr ? pr.platformKey : g1.defaults.platform);
      if (pr) {
        body += '<div class="row">' + A.select('scm-path', Object.keys(pr.model.paths).map(function (k) { return { id: k, title: k + ': ' + pr.model.paths[k].description }; }), pr.path, 'Save path') + '</div>';
        body += '<p>' + esc(ord.join(' then ')) + ': preset <b>' + A.fmtMs(pr.ri.centreMs) + '</b>, anywhere in ' + A.fmtMs(pr.ri.physLoMs) + ' to ' + A.fmtMs(pr.ri.physHiMs) + '.</p>';
        body += '<p class="small muted">A starting point, not your console - read the notes at the bottom before trusting it.</p>';
      } else if (GEN2[game]) {
        body += '<p class="warn">No preset for Gen 2. Nobody has measured a reset interval for Gold, Silver or Crystal and this project has no model for one, so the app offers none rather than inventing one.</p>';
        body += '<p class="small muted">Gen 2 is also not the same trick as Gen 1, so a Gen 1 number is not even a rough guide here. Capture your own below, and treat it as yours alone.</p>';
      } else {
        body += '<p class="warn">No preset for this game. Capture your own below.</p>';
      }
      h += A.card('<h3>1. Where you are playing</h3>' + body);

      h += A.card('<h3>2. Your interval</h3>' +
        '<p class="small muted">A number you measured off a recording beats one you tapped in: a tap goes through your reaction, twice.</p>' +
        '<div class="row"><label class="field">Interval (ms)<input type="number" step="0.1" min="' + MIN_INTERVAL_MS + '" id="scm-interval" value="' + (iv == null ? '' : Math.round(iv * 10) / 10) + '" placeholder="' + (pr ? Math.round(pr.ri.centreMs) : 'capture or type') + '"></label>' +
        '<label class="field">Attempt every (s)<input type="number" step="0.1" min="0.5" id="scm-cadence" value="' + esc(cadenceS(game) == null ? '' : cadenceS(game)) + '"></label></div>' +
        '<p><button type="button" class="secondary small" data-scm="tap">Tap here</button> ' +
        '<button type="button" class="secondary small" data-scm="tapclear">Clear taps</button> ' +
        '<button type="button" class="secondary small" data-scm="usetaps">Use the tapped interval</button></p>' +
        '<p class="small" id="scm-capmsg">' + esc(capMsgText(game)) + '</p>' +
        '<p class="small">Nudge by whole frames (' + FRAME_MS.toFixed(2) + ' ms each): ' +
        '<button type="button" class="secondary small" data-scm="down">-1 frame</button> ' +
        '<button type="button" class="secondary small" data-scm="up">+1 frame</button> ' +
        '<button type="button" class="secondary small" data-scm="reset">Back to the preset</button></p>');

      // Card 3 only exists where an order is modelled. Without one there is no way to say which direction
      // helps, and a guess here would walk the player out of the window while sounding certain.
      if (pr) {
        h += A.card('<h3>3. What happened on your last try?</h3>' +
          '<p class="small muted">The Pokemon Speedrunning route notes give two failure signs and read both as the reset going too early. They are reported there, not measured here, so this only tells you which way to move - it does not change your number for you.</p>' +
          '<p><button type="button" class="secondary small" data-scm="fail-nocontinue">No CONTINUE on the menu</button> ' +
          '<button type="button" class="secondary small" data-scm="fail-destroyed">"Save data is destroyed"</button></p>' +
          '<p class="small" id="scm-failmsg"></p>');
      }

      var consent = !!p('flashConsent', game, false), flash = !!p('flash', game, false);
      h += A.card('<h3>' + (pr ? '4' : '3') + '. The beat</h3>' +
        '<div class="row">' + A.select('scm-mode', [{ id: 'pair', title: 'pair - gap - pair (the real rhythm)' }, { id: 'even', title: 'even tick (drill the gap alone)' }], modeOf(game), 'Rhythm') + '</div>' +
        '<p><label><input type="checkbox" id="scm-sound"' + (p('sound', game, true) !== false ? ' checked' : '') + '> Sound</label></p>' +
        '<p class="small muted">Muting leaves a visual-only beat. A silent page in a background tab is throttled by the browser to about once a second and then once a minute, so a muted beat is only trustworthy while this tab is in front.</p>' +
        '<div class="scm-flashbox">' +
        '<p class="warn"><b>Flashing lights.</b> The visual beat can flash, and flashing light can trigger seizures in people with photosensitive epilepsy. It is off until you turn it on. Being able to switch it off is not by itself a safeguard - a seizure can come faster than anyone reaches the switch - so the app also limits the rate in code: no more than three flashes in any one second, the whole screen only when the gaps are at least half a second, and no blinking at all above the limit.</p>' +
        '<p><label><input type="checkbox" id="scm-flash-consent"' + (consent ? ' checked' : '') + '> I have read the warning above</label></p>' +
        '<p><label><input type="checkbox" id="scm-flash"' + (flash ? ' checked' : '') + (consent ? '' : ' disabled') + '> Flash the beat<span id="scm-flashnote">' + (consent ? '' : ' (read the warning first)') + '</span></label></p>' +
        '<p class="small muted" id="scm-flashplan">' + esc(flashPlanText(game)) + '</p>' +
        '</div>' +
        '<p><button type="button" class="primary" data-scm="start">Start</button> <button type="button" class="secondary" data-scm="stop">Stop</button></p>' +
        '<p><span id="scm-dot" class="scm-dot"></span></p>' +
        '<p class="small" id="scm-status">Stopped.</p>');

      h += A.card('<h3>Before you trust any of this</h3>' + disclosureHtml(game, pr));
      el.innerHTML = h;
    }

    function onEvent(ev, game) {
      var t = ev.target;
      if (ev.type === 'click') {
        var c = t.closest('[data-choice]');
        if (c && c.getAttribute('data-choice') === 'scm-platform') { stopLoop(true); set('platform', game, c.getAttribute('data-id')); set('intervalMs', game, undefined); return 'render'; }
        var b = t.closest('[data-scm]');
        if (!b) return null;
        var act = b.getAttribute('data-scm'), iv = intervalMs(game);
        if (act === 'tap') {
          // Updated IN PLACE. Returning 'render' here re-ran the whole mode, which scrolls to the top and
          // moves this button out from under the finger - the one flow the button exists for.
          var ts = (ev.timeStamp != null && isFinite(ev.timeStamp) && ev.timeStamp > 0) ? ev.timeStamp : (root.performance ? performance.now() : Date.now());
          if (state.taps.length && ts - state.taps[state.taps.length - 1] > 5000) state.taps = [];  // a pause is a new run, not a 5 s gap
          state.taps.push(ts);
          if (state.taps.length > 16) state.taps = state.taps.slice(-16);
          A.Cue.arm();
          var m1 = A.$('scm-capmsg'); if (m1) m1.textContent = capMsgText(game);
          return null;
        }
        if (act === 'tapclear') { state.taps = []; var m2 = A.$('scm-capmsg'); if (m2) m2.textContent = capMsgText(game); return null; }
        if (act === 'usetaps') {
          // The same mode capMsgText showed the player, so the number taken is the number quoted.
          var cap = capture(state.taps, modeOf(game));
          // a run read a beat out would install the wait between attempts as the interval, which is the one
          // number this card exists to get right
          if (!cap.ok || cap.misordered) { var m3 = A.$('scm-capmsg'); if (m3) m3.textContent = capMsgText(game); return null; }
          set('intervalMs', game, clampInterval(cap.medianMs)); return adjusted(game);
        }
        if (act === 'up' && iv != null) { set('intervalMs', game, clampInterval(nudge(iv, 1))); return adjusted(game); }
        if (act === 'down' && iv != null) { set('intervalMs', game, clampInterval(nudge(iv, -1))); return adjusted(game); }
        if (act === 'reset') { set('intervalMs', game, undefined); return adjusted(game); }
        if (act === 'start') { startLoop(game); return null; }
        if (act === 'stop') { stopLoop(); return null; }
        if (act === 'fail-nocontinue' || act === 'fail-destroyed') {
          var ord = orderOf(game);
          var msg = A.$('scm-failmsg');
          if (!msg) return null;
          if (!ord) { msg.textContent = 'Nothing models this game, so the app will not tell you which way to move.'; return null; }
          var far = act === 'fail-nocontinue', first = resetIsFirst(ord);
          // The direction is DERIVED from which side of the interval the reset sits on, not written down:
          // with the reset first the console runs on through a fade, so a longer wait puts the reset EARLIER
          // in the save; with the reset second a longer wait puts it LATER. The same failure therefore wants
          // opposite corrections on the two models.
          msg.textContent = (far ? 'No CONTINUE means the save never got far enough to look valid, so the reset was well before the first checksum. ' : '"Save data is destroyed" means the file was written but its checksum does not match what is in it - the near miss. ')
            + 'The route notes read both as the reset being too early. On ' + (first ? 'this platform the reset comes FIRST, and waiting longer before ' + ord[1] + ' puts it EARLIER in the save - so try a SHORTER interval' : 'this platform the reset comes SECOND, and waiting longer puts it LATER in the save - so try a LONGER interval')
            + ': press ' + (correctionFrames(ord, 1) < 0 ? '"-1 frame"' : '"+1 frame"') + ' ' + (far ? 'a few times' : 'once') + ' and go again. If that makes it worse, the fault is the other side of the window and you want the opposite button.';
          return null;
        }
        return null;
      }
      // WHICH EVENT COMMITS. The page delegates both 'input' and 'change' to here, and a select or a
      // checkbox fires BOTH for one user action, so every handler below has to say which one it answers to
      // or it runs twice per click. The two number fields answer to 'change' only, which is the
      // COMMITTED value: 'input' arrives per keystroke, so "4" on the way to "420" would be stored and
      // played as 20 ms (the floor) before the second digit was typed, and with the old re-render it would
      // also have taken the field out from under the caret. The controls whose value arrives whole - the
      // select and the three checkboxes - answer to whichever of the two lands first and then ignore the
      // second by comparing against what is already stored, which also makes a repeated event harmless.
      if (ev.type === 'change' || ev.type === 'input') {
        if (t.id === 'scm-interval') {
          if (ev.type !== 'change') return null;
          var v = Number(t.value);
          set('intervalMs', game, isFinite(v) && v > 0 ? clampInterval(v) : undefined);
          return adjusted(game);
        }
        if (t.id === 'scm-cadence') {
          if (ev.type !== 'change') return null;
          // Anything that is not a positive number clears the preference back to the data's own cadence,
          // rather than storing the 0 that an emptied field used to leave behind.
          var cs = Number(t.value);
          set('cadenceS', game, isFinite(cs) && cs > 0 ? cs : undefined);
          return adjusted(game);
        }
        if (t.id === 'scm-mode') {
          var mo = t.value === 'even' ? 'even' : 'pair';
          if (mo === modeOf(game)) return null;
          set('mode', game, mo);
          return adjusted(game);
        }
        if (t.id === 'scm-path') {
          // The save path changes the model's own numbers, so the preset and the typed override both go:
          // this is a different measurement, not an adjustment to the one being played.
          if (t.value === p('path', game, 'route')) return null;
          stopLoop(true); set('path', game, t.value); set('intervalMs', game, undefined); return 'render';
        }
        if (t.id === 'scm-sound') {
          if (!!t.checked === (p('sound', game, true) !== false)) return null;
          set('sound', game, !!t.checked);
          return adjusted(game);
        }
        if (t.id === 'scm-flash-consent') {
          if (!!t.checked === !!p('flashConsent', game, false)) return null;
          set('flashConsent', game, !!t.checked);
          if (!t.checked) { set('flash', game, false); var fb = A.$('scm-flash'); if (fb) fb.checked = false; }
          return adjusted(game);
        }
        if (t.id === 'scm-flash') {
          var want = !!t.checked && !!p('flashConsent', game, false);
          if (want === !!p('flash', game, false)) return null;
          set('flash', game, want);
          return adjusted(game);
        }
      }
      return null;
    }

    A.registerMode({
      id: 'sc-metronome', title: 'SC Metronome (save corruption)',
      games: ['red', 'blue', 'yellow', 'gold', 'silver', 'crystal'],
      render: render, onEvent: onEvent,
      line: function (game) {
        var pr = preset(game);
        return pr ? 'preset ' + A.fmtMs(pr.ri.centreMs) + ', ' + pr.ri.order.join(' then ') + ' - a starting point, not your console'
          : 'nothing measured for this game: capture your own interval';
      },
      sub: function () { return 'reset metronome'; }
    });
  }

  return pure;
});
