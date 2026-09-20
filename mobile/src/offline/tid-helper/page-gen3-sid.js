// TID Helper page: Emerald / FireRed / LeafGreen, the Secret ID from a typed Trainer ID, a port of the site's Gen3Flow
// (src/app/rng-solution/page.tsx): the methodology's model (ShinyGen1Tid.sidModel: variants, text speeds, name lengths),
// k_fixed and the stage counts, the press cue (kWindowForCue / cueBeeps: the count-in tone for every press but the last,
// the A tone for the last, each beep naming its own button), the candidates (sidCandidates over the k window, or
// k_fixed .. k_fixed + k_default_span without a cue), the pins (a PID seen shiny or not shiny under this Trainer ID)
// that narrow them, and the k a finished run turns out to have hit. UMD: pure part under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperGen3Sid = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  var CUE_EARLY_FRAMES = 6, CUE_LATE_FRAMES = 20, DEFAULT_MARGIN_FRAMES = 30, MIN_MARGIN_FRAMES = 15;   // the site's cue allowances
  function fail(msg) { throw new Error(msg); }

  // ---- which button each beep wants -------------------------------------------------------------------
  // The GBA's buttons, here only so that a button can be RECOGNISED in the data's own words. Nothing in this
  // block states a fact about a game: pressButton reads the button out of the head of that stage's own
  // stage_text, defaultButton repeats the one the methodology's validity condition names, and when neither
  // names one the page prints "not named" rather than assuming.
  var BUTTONS = ['START', 'SELECT', 'DOWN', 'LEFT', 'RIGHT', 'UP', 'A', 'B', 'L', 'R'];
  function pressButton(stageText) {
    var m = /^([A-Z]+)\b/.exec(String(stageText == null ? '' : stageText).trim());
    return m && BUTTONS.indexOf(m[1]) !== -1 ? m[1] : null;
  }
  // any OTHER button the stage's text names: on the preset-rival path that text names an untimed DOWN before the
  // cued press, and a runner told only "press A on the beep" picks NEW NAME instead and voids the attempt
  function extraButtons(stageText, button) {
    var s = String(stageText == null ? '' : stageText), out = [];
    BUTTONS.forEach(function (b) {
      if (b === button || out.indexOf(b) !== -1) return;
      if (new RegExp('(^|[^A-Za-z])' + b + '([^A-Za-z]|$)').test(s)) out.push(b);
    });
    return out;
  }
  // the methodology's own sentence about what a press is, and the button named inside it. It is quoted to the
  // runner rather than paraphrased, because it is the only thing that names a button for the stages whose own
  // stage_text does not.
  function pressRule(meth) {
    var v = (meth && meth.validity) || [];
    for (var i = 0; i < v.length; i++) if (/every press after naming/i.test(v[i])) return v[i];
    return null;
  }
  function defaultButton(meth) {
    var s = pressRule(meth), m = s && /\bone tap of ([A-Z]+)\b/.exec(s);
    return m && BUTTONS.indexOf(m[1]) !== -1 ? m[1] : null;
  }

  function context(D, G1, game, variantName, textSpeed, nameLength, margin) {
    var g = D.gen3sid.games[game];
    if (!g || g.status !== 'sid') fail('no Secret ID methodology for ' + game);
    var methId = g.methodology, meth = D.gen3sid.methodologies[methId], variants = G1.variantNames(meth.model);
    if (variants.indexOf(variantName) === -1) variantName = meth.model.default_variant || variants[0];
    var model = G1.sidModel(D.gen3sid, methId, variantName), speeds = Object.keys(model.text_speed);
    var ctx = { game: game, methId: methId, meth: meth, variants: variants, variantName: variantName, model: model, speeds: speeds, textSpeed: textSpeed, nameLength: nameLength, margin: Math.max(MIN_MARGIN_FRAMES, margin || DEFAULT_MARGIN_FRAMES), kFixed: null, error: null, stages: [], win: null };
    if (!textSpeed) { ctx.error = 'Choose the text speed: it is a validity condition (the data names no default).'; return ctx; }
    if (speeds.indexOf(textSpeed) === -1) { ctx.error = 'no text speed ' + textSpeed + ' in the model (' + speeds.join(', ') + ')'; return ctx; }
    try {
      ctx.kFixed = G1.kFixed(model, nameLength, textSpeed);
      ctx.stages = G1.stagePressToPress(model, nameLength, textSpeed);
      ctx.win = G1.kWindowForCue(model, nameLength, textSpeed, ctx.margin, CUE_EARLY_FRAMES, CUE_LATE_FRAMES);
    } catch (e) { ctx.error = e.message || String(e); }
    return ctx;
  }
  function kRange(ctx, cued) { if (ctx.kFixed == null) return null; return cued && ctx.win ? [ctx.win.kMin, ctx.win.kMax] : [ctx.kFixed, ctx.kFixed + ctx.model.k_default_span]; }
  function candidates(G1, ctx, tid, cued, pins, tsv) {
    var r = kRange(ctx, cued); if (!r) return { kept: [], dropped: {}, range: null };
    var all = G1.sidCandidates(tid, r[0], r[1]);
    var f = G1.filterCandidates(all, tid, (pins || []).filter(function (p) { return p.shiny; }).map(function (p) { return p.pid; }), (pins || []).filter(function (p) { return !p.shiny; }).map(function (p) { return p.pid; }), tsv == null ? null : tsv);
    return { kept: f.kept, dropped: f.dropped, range: r, total: all.length };
  }

  // One row per beep: the engine's stage and frame, the data's own description of that press, and the button it
  // wants. WHY this exists: the cue text used to read "press A ON each beep". It is not A on each beep. On the
  // FireRed and LeafGreen NEW NAME path beep 6 of 11 is the stage 'rival-start', whose stage_text reads
  // "START (cursor to OK)" - an A there types another letter instead of moving the cursor to OK, and the attempt
  // is lost. The button is read per stage now: from that stage's own words first, from the methodology's validity
  // condition otherwise, and from nowhere at all if neither names one.
  function presses(G1, ctx) {
    if (!ctx || !ctx.win) return [];
    var def = defaultButton(ctx.meth), st = ctx.model.stage_text || {}, n = ctx.win.beeps.length;
    return ctx.win.beeps.map(function (b, i) {
      var text = st[b[0]] == null ? null : st[b[0]], named = pressButton(text);
      var button = named || def;
      return { i: i, n: n, last: i === n - 1, stage: b[0], frame: b[1], t: G1.gbaFramesToSeconds(b[1]),
        text: text, button: button, stated: named != null, extra: extraButtons(text, button) };
    });
  }
  // the beeps this path wants a button other than the methodology's default for, and the beeps whose text names a
  // second (uncued) press: both are generated from the rows, so a data change moves them without touching the page
  function oddPresses(rows, def) { return rows.filter(function (r) { return r.button !== def; }); }
  function extraPresses(rows) { return rows.filter(function (r) { return r.extra.length; }); }
  function closestGap(rows) {
    var best = null;
    for (var i = 1; i < rows.length; i++) { var d = rows[i].t - rows[i - 1].t; if (best === null || d < best.gap) best = { gap: d, i: i }; }
    return best;
  }

  // as RNG Solution's sidcli.build_cue: the count-in tone for every press but the last, the long A tone for the
  // last (the one that sets k). The KIND is what decides the flash text, because page-cue.js's VISUAL map is
  // shared with every other mode and is not edited from here: 'abeat' prints its own 'A' and 'press-last' its own
  // 'A!', so those two name their button already, while 'press' prints the cue's label - so a press the data names
  // another button for carries that button AS its label, and START is what the runner sees on beep 6. The label of
  // an A press stays the engine's stage name, which is what the clock line and the beep table key on. The last
  // press only gets 'press-last' while its button really is A; if the data ever names another, it falls to 'press'
  // and shows that button, rather than the map's hardcoded green "A!".
  function beepCues(G1, ctx) {
    return presses(G1, ctx).map(function (p) {
      var tone = p.last ? G1.A_CUE_TONE : G1.COUNT_IN_TONE;
      var kind = p.button !== 'A' ? 'press' : (p.last ? 'press-last' : 'abeat');
      return { t: p.t, freq: tone[0], ms: tone[1], kind: kind, stage: p.stage, button: p.button,
        label: kind === 'press' ? (p.button || p.stage) : p.stage };
    });
  }

  // ---- what a played cue was played FOR ----------------------------------------------------------------
  // This used to be a bare module-level boolean, cleared by the text-speed / name-length / variant / margin
  // handlers. Switching game cleared nothing, and this one mode module serves all three games: a cue played on
  // FireRed left Emerald printing "A cue was played: candidates are the cue window" and narrowing its candidate
  // list to a window that had never been cued on that game. The cue now records the signature of the window it
  // actually played, and the narrowing is honoured only while the page still shows that same window - which
  // subsumes the four handler resets, so they are gone.
  function cueSignature(game, ctx) {
    if (!ctx || !ctx.win) return null;
    return [game, ctx.methId, ctx.variantName, ctx.textSpeed, ctx.nameLength, ctx.margin,
      ctx.kFixed, ctx.win.beeps.length, ctx.win.kMin, ctx.win.kMax].join('|');
  }
  function cueApplies(cue, game, ctx) {
    var sig = cueSignature(game, ctx);
    return !!(cue && sig && cue.sig === sig);
  }

  // ---- what the run actually hit -----------------------------------------------------------------------
  // A.widgets.calibrationHtml is deliberately NOT used here, and this lighter panel stands in its place. That
  // widget is built around the Gen 1 engine's samples: it takes the Trainer ID an attempt produced, inverts it
  // through a frame table and averages an implied anchor correction in milliseconds. None of that arithmetic
  // applies to this methodology - the Trainer ID is the INPUT here (a sub-frame Timer1 count the data says no
  // timing can aim at), there is no table to invert, and the correction it would average is a Gen 1 anchor offset
  // this mode has no anchor for. What a finished run does yield is the Secret ID, and that inverts exactly: k is
  // the k whose sidCandidates entry is that SID (G1.kForSid). k - k_expected is then the error of the LAST press
  // against its beep, and only that press's timing reaches k, because every beep sits at a fixed offset from the
  // anchor, so an earlier press landing anywhere between its box and its beep is absorbed by the next fixed beep.
  function observedK(G1, ctx, tid, sid) {
    if (!ctx || ctx.kFixed == null) return null;
    var kMax = ctx.kFixed + ctx.model.k_default_span;
    if (ctx.win && ctx.win.kMax > kMax) kMax = ctx.win.kMax;
    var exp = ctx.win ? ctx.win.kExpected : null;
    var hits = G1.kForSid(tid, sid, kMax).filter(function (k) { return k >= ctx.kFixed; }).map(function (k) {
      return { k: k, fromFixed: k - ctx.kFixed, fromExpected: exp == null ? null : k - exp,
        inWindow: !!(ctx.win && k >= ctx.win.kMin && k <= ctx.win.kMax) };
    });
    return { kMin: ctx.kFixed, kMax: kMax, kExpected: exp, hits: hits };
  }
  // the samples' spread, in frames. A plain mean and range: there is no distribution claim here, and no engine
  // statistic is borrowed, because the Gen 1 statistics are about millisecond anchor samples and these are frames.
  function sampleStats(list) {
    var xs = (list || []).map(function (s) { return s.e; }).filter(function (x) { return typeof x === 'number' && x === x; });
    if (!xs.length) return { n: 0 };
    var sum = 0, lo = xs[0], hi = xs[0];
    xs.forEach(function (x) { sum += x; if (x < lo) lo = x; if (x > hi) hi = x; });
    return { n: xs.length, mean: sum / xs.length, min: lo, max: hi };
  }
  // the verdict on a mean last-press error: the window's own allowances decide it, nothing else
  function windowVerdict(meanFrames) {
    if (typeof meanFrames !== 'number' || meanFrames !== meanFrames) return null;
    if (meanFrames > CUE_LATE_FRAMES) return 'late';
    if (meanFrames < -CUE_EARLY_FRAMES) return 'early';
    return 'inside';
  }

  // the sentences of a data text (split on '. ' outside parentheses), and the one that mentions hardware, quoted verbatim
  function sentences(text) {
    var out = [], cur = '', depth = 0, s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i]; cur += c;
      if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === '.' && depth === 0 && (i + 1 === s.length || s[i + 1] === ' ')) { out.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function hardwareSentence(status) { return sentences(status).filter(function (x) { return /hardware/i.test(x); })[0] || null; }
  var pure = { CUE_EARLY_FRAMES: CUE_EARLY_FRAMES, CUE_LATE_FRAMES: CUE_LATE_FRAMES, DEFAULT_MARGIN_FRAMES: DEFAULT_MARGIN_FRAMES, MIN_MARGIN_FRAMES: MIN_MARGIN_FRAMES, BUTTONS: BUTTONS,
    pressButton: pressButton, extraButtons: extraButtons, pressRule: pressRule, defaultButton: defaultButton,
    context: context, kRange: kRange, candidates: candidates, presses: presses, oddPresses: oddPresses, extraPresses: extraPresses, closestGap: closestGap, beepCues: beepCues,
    cueSignature: cueSignature, cueApplies: cueApplies, observedK: observedK, sampleStats: sampleStats, windowVerdict: windowVerdict,
    sentences: sentences, hardwareSentence: hardwareSentence };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'sid';
    // state.cue is the cue LAST PLAYED, as {sig, what}, never a bare "a cue happened" flag. See cueSignature above.
    var state = { cue: null, hitMsg: '' };
    function p(k, d) { return A.pref(SEC, k, d); }
    function ctxFor(game) {
      var ts = p('textSpeed.' + game, game === 'emerald' ? '' : 'mid');
      return context(A.D, A.G1, game, p('variant', null), ts, Number(p('nameLength', 7)) || 7, Number(p('margin', DEFAULT_MARGIN_FRAMES)) || DEFAULT_MARGIN_FRAMES);
    }
    function pins(game, tid) { var all = p('pins', {}); var k = game + ':' + tid; return Array.isArray(all[k]) ? all[k] : []; }
    function setPins(game, tid, next) { var all = p('pins', {}), copy = {}; Object.keys(all).forEach(function (k) { copy[k] = all[k]; }); copy[game + ':' + tid] = next; A.setPref(SEC, { pins: copy }); }
    function samples() { var s = p('samples', []); return Array.isArray(s) ? s : []; }
    // frames both ways: the count, and what the ENGINE's GBA frame rate makes of it (gbaFramesToSeconds, never 60 Hz)
    function frames(f) { var n = Math.abs(Number(f)); return n.toFixed(Math.abs(n - Math.round(n)) < 1e-9 ? 0 : 1) + ' frame' + (n === 1 ? '' : 's') + ' (' + A.fmtMs(1000 * A.G1.gbaFramesToSeconds(n)) + ')'; }
    // the same, signed, for a mean or a recorded run: minus is earlier than the beep, plus is later
    function lateness(f) { return (f > 0 ? '+' : f < 0 ? '-' : '') + frames(f) + (f > 0 ? ' late' : f < 0 ? ' early' : ' exactly on it'); }
    function tidOf() { var t = String(p('tid', '')).trim(); if (!t) return null; try { return A.G1.parseTid(t); } catch (e) { return null; } }
    function repaint(game) {
      var ctx = ctxFor(game), rows = presses(A.G1, ctx);
      var a = A.$('sid-cue-block'); if (a) a.innerHTML = cueHtml(game, ctx, rows);
      var b = A.$('sid-result'); if (b) b.innerHTML = resultHtml(game, ctx);
      var c = A.$('sid-hit-block'); if (c) c.innerHTML = hitHtml(game, ctx);
    }
    function resultHtml(game, ctx) {
      var text = String(p('tid', '')).trim();
      if (ctx.error) return '<p class="warn">' + esc(ctx.error) + '</p>';
      if (!text) return '<p class="muted">Type the Trainer ID from the Trainer Card.</p>';
      var tid; try { tid = A.G1.parseTid(text); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      var cued = cueApplies(state.cue, game, ctx);
      var tsvText = String(p('tsv', '')).trim(), tsv = tsvText !== '' && !isNaN(Number(tsvText)) ? Number(tsvText) : null;
      var ps = pins(game, tid), res = candidates(A.G1, ctx, tid, cued, ps, tsv);
      var h = '<p>k = ' + res.range[0] + ' .. ' + res.range[1] + (cued ? ' (the cue window: k_fixed ' + ctx.kFixed + ' + ' + ctx.win.beeps.length + ' x margin ' + ctx.margin + ', -' + CUE_EARLY_FRAMES + '/+' + CUE_LATE_FRAMES + ' frames)' : ' (no cue played for these settings: k_fixed ' + ctx.kFixed + ' .. + k_default_span ' + ctx.model.k_default_span + ')') + ': ' + res.kept.length + ' of ' + res.total + ' candidates kept.</p>';
      h += '<div class="row"><label class="field">TSV filter (optional)<input type="number" id="sid-tsv" value="' + esc(tsvText) + '"></label></div>';
      h += '<div class="scroll"><table class="tbl"><tr><th>k</th><th>SID</th><th>TSV</th></tr>' + res.kept.slice(0, 200).map(function (c) { return '<tr><td>' + c.k + '</td><td class="mono">' + esc(A.fmtTid(c.sid)) + '</td><td>' + c.tsv + '</td></tr>'; }).join('') + '</table></div>' + (res.kept.length > 200 ? '<p class="small muted">first 200 shown</p>' : '');
      h += '<h3>Pins</h3><p class="small muted">A PID you can see is shiny (or not) under this Trainer ID allows (or excludes) exactly 8 Secret IDs.</p>';
      h += '<div class="row"><label class="field">PID (8 hex digits)<input type="text" id="sid-pin-pid" placeholder="$1A2B3C4D"></label>' + A.select('sid-pin-shiny', [{ id: 'shiny', title: 'shiny' }, { id: 'not', title: 'not shiny' }], 'shiny', 'Seen') + '<button type="button" class="small" data-sid-pin="add">Pin</button></div><div id="sid-pin-msg" class="msg"></div>';
      if (ps.length) h += '<ul class="plain small">' + ps.map(function (x, i) { return '<li>PID ' + esc(A.hex8(x.pid)) + ' ' + (x.shiny ? 'shiny' : 'not shiny') + ' <button type="button" class="secondary small" data-sid-pin="drop" data-i="' + i + '">drop</button></li>'; }).join('') + '</ul>';
      return h;
    }
    // the per-beep table: every beep says which button it wants and quotes the data's own description of that press
    function beepTableHtml(ctx, rows, def) {
      var h = '<div class="scroll"><table class="tbl"><tr><th>beep</th><th>after OK</th><th>frame</th><th>press</th><th>tone</th><th>what the data says about this press</th></tr>';
      h += rows.map(function (r) {
        return '<tr><td>' + (r.i + 1) + '</td><td>' + A.fmtS(r.t, 2) + '</td><td>' + r.frame + '</td>' +
          '<td class="mono">' + esc(r.button == null ? 'not named' : r.button) + (r.stated ? '' : ' *') + '</td>' +
          '<td>' + (r.last ? 'long (sets k)' : 'short') + '</td>' +
          '<td class="small">' + esc(r.text == null ? 'the data carries no description for the stage ' + r.stage : r.text) + '</td></tr>';
      }).join('') + '</table></div>';
      var unstated = rows.filter(function (r) { return !r.stated; }).length;
      if (unstated) h += '<p class="small muted">* ' + unstated + ' of the ' + rows.length + ' beeps are given no button by their own entry in the data. They take it from this methodology\'s validity condition, quoted verbatim: "' + esc(pressRule(ctx.meth) || 'the data carries no such condition') + '"' + (def ? '' : ' - which names none either, so those beeps read "not named" rather than being guessed at') + '</p>';
      return h;
    }
    function cueHtml(game, ctx, rows) {
      if (!rows.length) return '<p class="muted">Choose the settings first.</p>';
      var def = defaultButton(ctx.meth), odd = oddPresses(rows, def), extra = extraPresses(rows), gap = closestGap(rows);
      var h = '<p class="small">Tap when you press A on OK at the naming screen; ' + rows.length + ' beeps follow at the model\'s frames + the margin, the last one long (that press is the one that sets k). ' +
        'Each beep is its own press, and they are NOT all the same button: the table below names the button for every beep, and the flash names it as the beep sounds. ';
      h += odd.length
        ? '<b>On this path ' + odd.length + ' of the ' + rows.length + ' beeps ' + (odd.length === 1 ? 'is' : 'are') + ' not ' + esc(String(def)) + ': ' + odd.map(function (r) { return 'beep ' + (r.i + 1) + ' is ' + esc(String(r.button)); }).join(', ') + '.</b> '
        : 'On this path every beep is ' + esc(String(def)) + '. ';
      if (gap) h += 'Closest beeps ' + A.fmtS(gap.gap, 2) + ' apart (beeps ' + gap.i + ' and ' + (gap.i + 1) + ').';
      h += '</p>';
      extra.forEach(function (r) {
        h += '<p class="small warn">Beep ' + (r.i + 1) + ' (' + esc(r.stage) + ') also needs ' + esc(r.extra.join(' / ')) + ', which the cue does not beep. The data\'s words: "' + esc(String(r.text)) + '"</p>';
      });
      h += '<div class="row"><button type="button" class="small anchor" data-sid-cue="start">Run: tap on A at OK</button><button type="button" class="secondary small" data-sid-cue="stop">Stop</button></div>';
      h += beepTableHtml(ctx, rows, def);
      if (cueApplies(state.cue, game, ctx)) h += '<p class="small good">A cue was played for these settings: candidates are the cue window.</p>';
      else if (state.cue) h += '<p class="small muted">The last cue was played for ' + esc(state.cue.what) + ', which is not what this page is showing now, so the candidates stay the full k_fixed span. Play the cue again to narrow them.</p>';
      return h;
    }
    // "What did you actually hit?" - the feedback this mode can honestly give; see observedK for why it is not
    // A.widgets.calibrationHtml
    function hitHtml(game, ctx) {
      if (ctx.error || ctx.kFixed == null) return '<p class="muted">Choose the settings first.</p>';
      var tid = tidOf();
      if (tid == null) return '<p class="muted">Type the Trainer ID above first: k is worked out from the Trainer ID and the Secret ID together.</p>';
      var sig = cueSignature(game, ctx), mine = samples().filter(function (s) { return s.sig === sig; }), st = sampleStats(mine);
      var h = '<p class="small muted">The Trainer ID is the input to this method, not its outcome, so there is nothing in it to calibrate against. What a run does produce is the Secret ID - from a save dump, or from one PID you can see is shiny (pin it above until a single candidate is left). The Secret ID gives k exactly, and k says how far the press that set it was from its beep.</p>';
      h += '<div class="row"><label class="field">Secret ID you learned (decimal or $hex)<input type="text" id="sid-hit" value="' + esc(p('hit', '')) + '"></label>' +
        '<button type="button" class="small" data-sid-hit="record">Work out k and record</button></div>';
      h += '<div id="sid-hit-msg" class="msg">' + (state.hitMsg || '') + '</div>';
      if (st.n) {
        var verdict = windowVerdict(st.mean);
        h += '<p class="small">' + st.n + ' recorded for exactly these settings: the last press was ' + esc(lateness(st.mean)) + ' on average, over a range of ' + esc(lateness(st.min)) + ' to ' + esc(lateness(st.max)) + '.</p>';
        h += '<p class="small ' + (verdict === 'inside' ? 'good' : 'warn') + '">' + (verdict === 'inside'
          ? 'That average is inside the window the narrowed list assumes (-' + CUE_EARLY_FRAMES + ' to +' + CUE_LATE_FRAMES + ' frames), so the narrowing is holding for you.'
          : verdict === 'late'
            ? 'That is later than the +' + CUE_LATE_FRAMES + ' frames the narrowed list assumes, so the cue window has been missing your real k: press earlier, or take the full k_fixed span as the candidate list.'
            : 'That is earlier than the -' + CUE_EARLY_FRAMES + ' frames the narrowed list assumes, so the cue window has been missing your real k: press later, or take the full k_fixed span as the candidate list.') + '</p>';
        h += A.details('The recorded runs (' + mine.length + ')', '<ul class="plain small">' + mine.map(function (s) { return '<li>TID ' + esc(A.fmtTid(s.tid)) + ' -> SID ' + esc(A.fmtTid(s.sid)) + ': k = ' + s.k + (typeof s.e === 'number' ? ', last press ' + esc(lateness(s.e)) : ', ' + esc(frames(s.d)) + ' of lateness in total') + '</li>'; }).join('') + '</ul>' +
          '<button type="button" class="secondary small" data-sid-hit="drop">Drop the last one</button> <button type="button" class="secondary small" data-sid-hit="clear">Clear these</button>');
      } else {
        h += '<p class="small muted">Nothing recorded for these settings yet. A run recorded here is a run whose k is known, so it says how far your last press really was from its beep - which is the whole of what this mode can be calibrated on.</p>';
      }
      var others = samples().length - mine.length;
      if (others > 0) h += '<p class="small muted">' + others + ' more run' + (others === 1 ? ' is' : 's are') + ' recorded under other settings and are not averaged here.</p>';
      return h;
    }
    function statusHtml(ctx) {
      var m = ctx.meth, g = A.D.gen3sid.games[ctx.game];
      return A.statusBlock([['Methodology', ctx.methId + ' (v' + m.version + ', ' + m.date + '): ' + m.name], ['Status', m.status], ['Model status', ctx.model.status || m.model.status || null], ['Platform', m.console_name], ['Predicts', m.predicts], ['Target mode', m.target_mode], ['Validity', A.VALID_ONLY], ['Table', m.table], ['Game', g.name + ' (data status: ' + g.status + ')']]) +
        A.details('Validity conditions (' + m.validity.length + ')', '<ol class="plain">' + m.validity.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ol>') + A.details('Protocol', '<p class="small">' + esc(m.protocol) + '</p>') + A.details('Validation', '<p class="small">' + esc(m.validation) + '</p>');
    }
    function render(el, game) {
      var ctx = ctxFor(game), rows = presses(A.G1, ctx);
      var h = '<h2>Secret ID from the Trainer ID: ' + esc(A.D.gen3sid.games[game].name) + '</h2>';
      h += A.card('<h3>1. Settings</h3><div class="row">' + A.select('sid-speed', [{ id: '', title: '(choose)' }].concat(ctx.speeds.map(function (s) { return { id: s, title: s }; })), ctx.textSpeed || '', 'OPTIONS text speed') +
        '<label class="field">Player name length<input type="number" min="1" max="7" id="sid-name" value="' + ctx.nameLength + '"></label>' + A.select('sid-variant', ctx.variants.map(function (v) { return { id: v, title: ctx.meth.model.variants[v].name }; }), ctx.variantName, 'Input path') +
        '<label class="field">Cue margin (frames, min ' + MIN_MARGIN_FRAMES + ')<input type="number" min="' + MIN_MARGIN_FRAMES + '" id="sid-margin" value="' + ctx.margin + '"></label></div>' +
        (ctx.error ? '<p class="warn">' + esc(ctx.error) + '</p>' : '<p class="small">k_fixed = ' + ctx.kFixed + ' VBlanks (' + ctx.stages.map(function (s) { return s[0] + ' ' + s[1]; }).join(', ') + ', then ' + ctx.model.text_speed[ctx.textSpeed].last_press_to_sid + ' to the roll).</p>') +
        '<p class="small muted">Console (the data\'s console_name): ' + esc(ctx.meth.console_name) + '.' + (function () { var s = hardwareSentence(ctx.meth.status); return s ? ' From the methodology\'s status: "' + esc(s) + '"' : ''; })() + '</p>');
      h += A.card('<h3>2. Press cue (optional: pins k to a window)</h3>' + A.toolsHtml(['eontimer'], 'A timed press after the naming screen is what EonTimer\'s custom and variable-target timers do for the Gen 3 games:') + '<div id="sid-cue-block">' + cueHtml(game, ctx, rows) + '</div>');
      h += A.card('<h3>3. Trainer ID -> Secret ID candidates</h3><label class="field">Trainer ID from the Trainer Card<input type="text" id="sid-tid" value="' + esc(p('tid', '')) + '"></label><div id="sid-result">' + resultHtml(game, ctx) + '</div>');
      h += A.card('<h3>4. What did you actually hit?</h3><div id="sid-hit-block">' + hitHtml(game, ctx) + '</div>');
      h += A.sourcesCard(game);
      h += A.card('<h3>Status (from the data)</h3>' + statusHtml(ctx));
      el.innerHTML = h;
    }
    function startCue(game) {
      var ctx = ctxFor(game), cues = beepCues(A.G1, ctx); if (!cues.length) return;
      A.Cue.arm();
      var last = cues[cues.length - 1];
      A.Cue.start(A.Cue.program({ cues: cues, visuals: A.Cue.visualsFor(cues), endT: last.t + 1.0, label: ctx.methId + ' presses after naming',
        clock: function (t) { var nx = null; for (var i = 0; i < cues.length; i++) if (cues[i].t > t) { nx = cues[i]; break; } return nx ? (nx.button || 'the press') + ' (' + nx.stage + ') in ' + (nx.t - t).toFixed(2) + ' s' : 'done'; },
        onTick: function (t, v, run) { var clk = A.$('runclock'); if (clk) clk.textContent = 'T+' + t.toFixed(2) + ' s   ' + run.clock(t); } }));
      var lbl = A.$('runlabel'); if (lbl) lbl.textContent = ctx.methId;
      // record WHAT was cued, never just that something was: see cueSignature
      state.cue = { sig: cueSignature(game, ctx), what: A.D.gen3sid.games[game].name + ', ' + ctx.variantName + ', ' + ctx.textSpeed + ' text, ' + ctx.nameLength + '-letter name, margin ' + ctx.margin };
    }
    function recordHit(game) {
      var ctx = ctxFor(game), tid = tidOf(), msgEl = A.$('sid-hit-msg');
      function say(html) { state.hitMsg = html; if (msgEl) msgEl.innerHTML = html; }
      if (tid == null || ctx.kFixed == null) { say('<p>Type the Trainer ID and choose the settings first.</p>'); return null; }
      var sid; try { sid = A.G1.checkSid(A.G1.parseTid(A.$('sid-hit').value)); } catch (e) { say('<p>Enter the Secret ID as a decimal or $hex number: ' + esc(A.errMsg(e)) + '</p>'); return null; }
      var o = observedK(A.G1, ctx, tid, sid);
      if (!o.hits.length) { say('<p>No k between ' + o.kMin + ' and ' + o.kMax + ' gives Secret ID ' + esc(A.fmtTid(sid)) + ' under Trainer ID ' + esc(A.fmtTid(tid)) + '. Either the settings shown here are not the ones that run used (text speed, name length, input path), or one of the validity conditions was broken on it. Nothing recorded.</p>'); return null; }
      var hit = o.hits.filter(function (x) { return x.inWindow; })[0] || o.hits[0];
      var lines = '<p>k = ' + hit.k + (o.hits.length > 1 ? ' (' + o.hits.length + ' values of k in the searched span give this Secret ID; this is the ' + (hit.inWindow ? 'one inside the cue window' : 'earliest') + ')' : '') + '.</p>';
      lines += hit.fromExpected == null
        ? '<p>That is ' + esc(frames(hit.fromFixed)) + ' beyond k_fixed, spread over every press of this path. Play the cue and record again to get the last press on its own.</p>'
        : '<p>The cue aimed at k ' + o.kExpected + ', so the last press landed ' + esc(frames(hit.fromExpected)) + ' ' + (hit.fromExpected >= 0 ? 'after' : 'before') + ' its beep. ' + (hit.inWindow ? 'Inside' : 'OUTSIDE') + ' the -' + CUE_EARLY_FRAMES + ' / +' + CUE_LATE_FRAMES + ' frame window the narrowed list assumes.</p>';
      A.setPref(SEC, { samples: samples().concat([{ sig: cueSignature(game, ctx), game: game, methId: ctx.methId, tid: tid, sid: sid, k: hit.k, e: hit.fromExpected, d: hit.fromFixed, n: ctx.win ? ctx.win.beeps.length : null }]), hit: '' });
      say(lines);
      repaint(game);
      return null;
    }
    function onEvent(ev, game) {
      var t = ev.target;
      if (ev.type === 'click') {
        var c = t.closest('[data-sid-cue]');
        if (c) {
          // never 'render' from here: page-render's render() calls widgets.stopAll(), which would kill the cue
          // this click just started
          if (c.getAttribute('data-sid-cue') === 'start') startCue(game); else A.widgets.stopAll();
          repaint(game);
          return null;
        }
        var hb = t.closest('[data-sid-hit]');
        if (hb) {
          var act = hb.getAttribute('data-sid-hit'), sig = cueSignature(game, ctxFor(game));
          if (act === 'record') return recordHit(game);
          if (act === 'drop') { var keep = samples(), i = -1, j; for (j = 0; j < keep.length; j++) if (keep[j].sig === sig) i = j; if (i >= 0) { keep = keep.slice(); keep.splice(i, 1); A.setPref(SEC, { samples: keep }); } state.hitMsg = ''; repaint(game); return null; }
          if (act === 'clear') { A.setPref(SEC, { samples: samples().filter(function (s) { return s.sig !== sig; }) }); state.hitMsg = ''; repaint(game); return null; }
          return null;
        }
        var pn = t.closest('[data-sid-pin]');
        if (pn) {
          var text = String(p('tid', '')).trim(), tid; try { tid = A.G1.parseTid(text); } catch (e) { return null; }
          var ps = pins(game, tid);
          if (pn.getAttribute('data-sid-pin') === 'drop') { ps = ps.slice(); ps.splice(Number(pn.getAttribute('data-i')), 1); setPins(game, tid, ps); return 'render'; }
          var pid; try { pid = A.G1.parsePid(A.$('sid-pin-pid').value); } catch (e) { var m = A.$('sid-pin-msg'); if (m) m.textContent = 'Enter the PID as 8 hex digits (or decimal): ' + A.errMsg(e); return null; }
          setPins(game, tid, ps.concat([{ pid: pid, shiny: A.$('sid-pin-shiny').value === 'shiny' }])); return 'render';
        }
      } else {
        // No handler clears the cue any more: cueApplies decides whether what was played still describes this page.
        if (t.id === 'sid-tid') { A.setPref(SEC, { tid: t.value }); var ct = ctxFor(game); var r = A.$('sid-result'); if (r) r.innerHTML = resultHtml(game, ct); var hh = A.$('sid-hit-block'); if (hh) hh.innerHTML = hitHtml(game, ct); }
        else if (t.id === 'sid-hit') { A.setPref(SEC, { hit: t.value }); }
        else if (t.id === 'sid-tsv') { A.setPref(SEC, { tsv: t.value }); var r2 = A.$('sid-result'); if (r2) r2.innerHTML = resultHtml(game, ctxFor(game)); }
        else if (t.id === 'sid-speed') { var patch = {}; patch['textSpeed.' + game] = t.value; A.setPref(SEC, patch); return 'render'; }
        else if (t.id === 'sid-name') { A.setPref(SEC, { nameLength: Number(t.value) }); return 'render'; }
        else if (t.id === 'sid-variant') { A.setPref(SEC, { variant: t.value }); return 'render'; }
        else if (t.id === 'sid-margin') { A.setPref(SEC, { margin: Number(t.value) }); return 'render'; }
      }
      return null;
    }
    A.registerMode({ id: 'gen3-sid', title: 'Secret ID from the Trainer ID', games: ['emerald', 'firered', 'leafgreen'], render: render, onEvent: onEvent,
      line: function (game) { return A.D.gen3sid.methodologies[A.D.gen3sid.games[game].methodology].status; }, sub: function (game) { return A.D.gen3sid.games[game].methodology; } });
  }
  return pure;
});
