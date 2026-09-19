// TID Helper page: Emerald / FireRed / LeafGreen, the Secret ID from a typed Trainer ID, a port of the site's Gen3Flow
// (src/app/rng-solution/page.tsx): the methodology's model (ShinyGen1Tid.sidModel: variants, text speeds, name lengths),
// k_fixed and the stage counts, the press cue (kWindowForCue / cueBeeps: the count-in tone for every press but the last,
// the A tone for the last), the candidates (sidCandidates over the k window, or k_fixed .. k_fixed + k_default_span without
// a cue), and the pins (a PID seen shiny or not shiny under this Trainer ID) that narrow them. UMD: pure part under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperGen3Sid = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  var CUE_EARLY_FRAMES = 6, CUE_LATE_FRAMES = 20, DEFAULT_MARGIN_FRAMES = 30, MIN_MARGIN_FRAMES = 15;   // the site's cue allowances
  function fail(msg) { throw new Error(msg); }
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
  // as RNG Solution's sidcli.build_cue: the count-in tone for every press but the last, the long A tone for the last (the one that sets k)
  function beepCues(G1, ctx) {
    if (!ctx.win) return [];
    return ctx.win.beeps.map(function (b, i) {
      var last = i === ctx.win.beeps.length - 1, tone = last ? G1.A_CUE_TONE : G1.COUNT_IN_TONE;
      return { t: G1.gbaFramesToSeconds(b[1]), freq: tone[0], ms: tone[1], label: b[0], kind: last ? 'press-last' : 'press' };
    });
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
  var pure = { CUE_EARLY_FRAMES: CUE_EARLY_FRAMES, CUE_LATE_FRAMES: CUE_LATE_FRAMES, DEFAULT_MARGIN_FRAMES: DEFAULT_MARGIN_FRAMES, MIN_MARGIN_FRAMES: MIN_MARGIN_FRAMES, context: context, kRange: kRange, candidates: candidates, beepCues: beepCues, sentences: sentences, hardwareSentence: hardwareSentence };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'sid';
    var state = { cued: false };
    function p(k, d) { return A.pref(SEC, k, d); }
    function ctxFor(game) {
      var ts = p('textSpeed.' + game, game === 'emerald' ? '' : 'mid');
      return context(A.D, A.G1, game, p('variant', null), ts, Number(p('nameLength', 7)) || 7, Number(p('margin', DEFAULT_MARGIN_FRAMES)) || DEFAULT_MARGIN_FRAMES);
    }
    function pins(game, tid) { var all = p('pins', {}); var k = game + ':' + tid; return Array.isArray(all[k]) ? all[k] : []; }
    function setPins(game, tid, next) { var all = p('pins', {}), copy = {}; Object.keys(all).forEach(function (k) { copy[k] = all[k]; }); copy[game + ':' + tid] = next; A.setPref(SEC, { pins: copy }); }
    function resultHtml(game, ctx) {
      var text = String(p('tid', '')).trim();
      if (ctx.error) return '<p class="warn">' + esc(ctx.error) + '</p>';
      if (!text) return '<p class="muted">Type the Trainer ID from the Trainer Card.</p>';
      var tid; try { tid = A.G1.parseTid(text); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      var tsvText = String(p('tsv', '')).trim(), tsv = tsvText !== '' && !isNaN(Number(tsvText)) ? Number(tsvText) : null;
      var ps = pins(game, tid), res = candidates(A.G1, ctx, tid, state.cued, ps, tsv);
      var h = '<p>k = ' + res.range[0] + ' .. ' + res.range[1] + (state.cued ? ' (the cue window: k_fixed ' + ctx.kFixed + ' + ' + ctx.win.beeps.length + ' x margin ' + ctx.margin + ', -' + CUE_EARLY_FRAMES + '/+' + CUE_LATE_FRAMES + ' frames)' : ' (no cue played: k_fixed ' + ctx.kFixed + ' .. + k_default_span ' + ctx.model.k_default_span + ')') + ': ' + res.kept.length + ' of ' + res.total + ' candidates kept.</p>';
      h += '<div class="row"><label class="field">TSV filter (optional)<input type="number" id="sid-tsv" value="' + esc(tsvText) + '"></label></div>';
      h += '<div class="scroll"><table class="tbl"><tr><th>k</th><th>SID</th><th>TSV</th></tr>' + res.kept.slice(0, 200).map(function (c) { return '<tr><td>' + c.k + '</td><td class="mono">' + esc(A.fmtTid(c.sid)) + '</td><td>' + c.tsv + '</td></tr>'; }).join('') + '</table></div>' + (res.kept.length > 200 ? '<p class="small muted">first 200 shown</p>' : '');
      h += '<h3>Pins</h3><p class="small muted">A PID you can see is shiny (or not) under this Trainer ID allows (or excludes) exactly 8 Secret IDs.</p>';
      h += '<div class="row"><label class="field">PID (8 hex digits)<input type="text" id="sid-pin-pid" placeholder="$1A2B3C4D"></label>' + A.select('sid-pin-shiny', [{ id: 'shiny', title: 'shiny' }, { id: 'not', title: 'not shiny' }], 'shiny', 'Seen') + '<button type="button" class="small" data-sid-pin="add">Pin</button></div><div id="sid-pin-msg" class="msg"></div>';
      if (ps.length) h += '<ul class="plain small">' + ps.map(function (x, i) { return '<li>PID ' + esc(A.hex8(x.pid)) + ' ' + (x.shiny ? 'shiny' : 'not shiny') + ' <button type="button" class="secondary small" data-sid-pin="drop" data-i="' + i + '">drop</button></li>'; }).join('') + '</ul>';
      return h;
    }
    function statusHtml(ctx) {
      var m = ctx.meth, g = A.D.gen3sid.games[ctx.game];
      return A.statusBlock([['Methodology', ctx.methId + ' (v' + m.version + ', ' + m.date + '): ' + m.name], ['Status', m.status], ['Model status', ctx.model.status || m.model.status || null], ['Platform', m.console_name], ['Predicts', m.predicts], ['Target mode', m.target_mode], ['Validity', A.VALID_ONLY], ['Table', m.table], ['Game', g.name + ' (data status: ' + g.status + ')']]) +
        A.details('Validity conditions (' + m.validity.length + ')', '<ol class="plain">' + m.validity.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ol>') + A.details('Protocol', '<p class="small">' + esc(m.protocol) + '</p>') + A.details('Validation', '<p class="small">' + esc(m.validation) + '</p>');
    }
    function render(el, game) {
      var ctx = ctxFor(game), cues = beepCues(A.G1, ctx);
      var h = '<h2>Secret ID from the Trainer ID: ' + esc(A.D.gen3sid.games[game].name) + '</h2>';
      h += A.card('<h3>1. Settings</h3><div class="row">' + A.select('sid-speed', [{ id: '', title: '(choose)' }].concat(ctx.speeds.map(function (s) { return { id: s, title: s }; })), ctx.textSpeed || '', 'OPTIONS text speed') +
        '<label class="field">Player name length<input type="number" min="1" max="7" id="sid-name" value="' + ctx.nameLength + '"></label>' + A.select('sid-variant', ctx.variants.map(function (v) { return { id: v, title: ctx.meth.model.variants[v].name }; }), ctx.variantName, 'Input path') +
        '<label class="field">Cue margin (frames, min ' + MIN_MARGIN_FRAMES + ')<input type="number" min="' + MIN_MARGIN_FRAMES + '" id="sid-margin" value="' + ctx.margin + '"></label></div>' +
        (ctx.error ? '<p class="warn">' + esc(ctx.error) + '</p>' : '<p class="small">k_fixed = ' + ctx.kFixed + ' VBlanks (' + ctx.stages.map(function (s) { return s[0] + ' ' + s[1]; }).join(', ') + ', then ' + ctx.model.text_speed[ctx.textSpeed].last_press_to_sid + ' to the roll).</p>') +
        '<p class="small muted">Console (the data\'s console_name): ' + esc(ctx.meth.console_name) + '.' + (function () { var s = hardwareSentence(ctx.meth.status); return s ? ' From the methodology\'s status: "' + esc(s) + '"' : ''; })() + '</p>');
      h += A.card('<h3>2. Press cue (optional: pins k to a window)</h3>' + A.toolsHtml(['eontimer'], 'A timed press after the naming screen is what EonTimer\'s custom and variable-target timers do for the Gen 3 games:') + (cues.length ? '<p class="small">Tap when you press A on OK at the naming screen; ' + cues.length + ' beeps follow at the model\'s frames + the margin, the last one long: press A ON each beep. ' + (function () { var m = Infinity; for (var i = 1; i < cues.length; i++) m = Math.min(m, cues[i].t - cues[i - 1].t); return isFinite(m) ? 'Closest beeps ' + m.toFixed(2) + ' s apart.' : ''; })() + '</p>' +
        '<div class="row"><button type="button" class="small anchor" data-sid-cue="start">Run: tap on A at OK</button><button type="button" class="secondary small" data-sid-cue="stop">Stop</button></div>' + (state.cued ? '<p class="small good">A cue was played: candidates are the cue window.</p>' : '') : '<p class="muted">Choose the settings first.</p>'));
      h += A.card('<h3>3. Trainer ID -> Secret ID candidates</h3><label class="field">Trainer ID from the Trainer Card<input type="text" id="sid-tid" value="' + esc(p('tid', '')) + '"></label><div id="sid-result">' + resultHtml(game, ctx) + '</div>');
      h += A.sourcesCard(game);
      h += A.card('<h3>Status (from the data)</h3>' + statusHtml(ctx));
      el.innerHTML = h;
    }
    function startCue(game) {
      var ctx = ctxFor(game), cues = beepCues(A.G1, ctx); if (!cues.length) return;
      A.Cue.arm();
      var last = cues[cues.length - 1];
      A.Cue.start(A.Cue.program({ cues: cues, visuals: A.Cue.visualsFor(cues), endT: last.t + 1.0, label: ctx.methId + ' presses after naming',
        clock: function (t) { var nx = null; for (var i = 0; i < cues.length; i++) if (cues[i].t > t) { nx = cues[i]; break; } return nx ? nx.label + ' in ' + (nx.t - t).toFixed(2) + ' s' : 'done'; },
        onTick: function (t, v, run) { var clk = A.$('runclock'); if (clk) clk.textContent = 'T+' + t.toFixed(2) + ' s   ' + run.clock(t); } }));
      var lbl = A.$('runlabel'); if (lbl) lbl.textContent = ctx.methId;
      state.cued = true;
    }
    function onEvent(ev, game) {
      var t = ev.target;
      if (ev.type === 'click') {
        var c = t.closest('[data-sid-cue]');
        if (c) {
          if (c.getAttribute('data-sid-cue') === 'start') startCue(game); else A.widgets.stopAll();
          var rr = A.$('sid-result'); if (rr) rr.innerHTML = resultHtml(game, ctxFor(game));
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
        if (t.id === 'sid-tid') { A.setPref(SEC, { tid: t.value }); var r = A.$('sid-result'); if (r) r.innerHTML = resultHtml(game, ctxFor(game)); }
        else if (t.id === 'sid-tsv') { A.setPref(SEC, { tsv: t.value }); var r2 = A.$('sid-result'); if (r2) r2.innerHTML = resultHtml(game, ctxFor(game)); }
        else if (t.id === 'sid-speed') { var patch = {}; patch['textSpeed.' + game] = t.value; A.setPref(SEC, patch); state.cued = false; return 'render'; }
        else if (t.id === 'sid-name') { A.setPref(SEC, { nameLength: Number(t.value) }); state.cued = false; return 'render'; }
        else if (t.id === 'sid-variant') { A.setPref(SEC, { variant: t.value }); state.cued = false; return 'render'; }
        else if (t.id === 'sid-margin') { A.setPref(SEC, { margin: Number(t.value) }); state.cued = false; return 'render'; }
      }
      return null;
    }
    A.registerMode({ id: 'gen3-sid', title: 'Secret ID from the Trainer ID', games: ['emerald', 'firered', 'leafgreen'], render: render, onEvent: onEvent,
      line: function (game) { return A.D.gen3sid.methodologies[A.D.gen3sid.games[game].methodology].status; }, sub: function (game) { return A.D.gen3sid.games[game].methodology; } });
  }
  return pure;
});
