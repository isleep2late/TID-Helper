// TID Helper page: state, the RN bridge (window.TidHelperBridge / window.__tidHelperQueue), the prefs store
// (sent to RN as {type:'prefs'} and mirrored to localStorage), the calibration stores, navigation, the shared
// HTML helpers and the mode registry the mode modules plug into. UMD: under node the pure parts (prefs merging,
// the bridge protocol, the formatting helpers, the data binding) run without a DOM; in the page, page-render.js
// boots everything once the engines and window.TID_HELPER_DATA are in place.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperApp = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  var VERSION = 'tid-helper-page/2';
  var PREFS_KEY = 'hackmons_tidhelper_prefs_v1';   // the same key the screen keeps in AsyncStorage (tidHelperProtocol.ts)
  var A = {
    version: VERSION, PREFS_KEY: PREFS_KEY,
    D: null, G1: null, G2: null, BD: null, Cue: null, Story: null,
    prefs: { version: 1 }, platformOS: null, initReceived: false, ready: false, outbox: [], bootError: null,
    screen: 'home', game: null, mode: null, modes: {}, order: [], state: {},
    // the one sentence every mode prints under its methodology id (the task's fixed wording, not a validation claim)
    VALID_ONLY: 'Predictions are valid only under this methodology.'
  };

  // ---- helpers -----------------------------------------------------------------------------------
  function $(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hex4(v) { var s = (v & 0xFFFF).toString(16).toUpperCase(); while (s.length < 4) s = '0' + s; return s; }
  function hex8(v) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < 8) s = '0' + s; return s; }
  function fmtS(x, d) { return Number(x).toFixed(d == null ? 3 : d) + ' s'; }
  function fmtMs(x) { return Number(x).toFixed(1) + ' ms'; }
  function fmtSigned(x, d) { return (x >= 0 ? '+' : '') + Number(x).toFixed(d == null ? 1 : d); }
  function pct(p) { return (100 * p).toFixed(0) + ' %'; }
  function fmtTid(t) { return t + ' ($' + hex4(t) + ')'; }
  function errMsg(e) { return e && e.message ? e.message : String(e); }
  // "4194304/70224" -> 59.7275...: the data states its frame rate as an expression; nothing here holds the number
  function parseFps(expr) {
    var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(expr));
    if (!m) throw new Error('fps_expression is not a/b: ' + JSON.stringify(expr));
    return Number(m[1]) / Number(m[2]);
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  // ---- page -> RN ---------------------------------------------------------------------------------
  function post(msg) {
    A.outbox.push(msg);
    try { if (root.ReactNativeWebView && root.ReactNativeWebView.postMessage) root.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) { /* no bridge */ }
  }
  function log(message) { post({ type: 'log', message: String(message) }); }
  function reportError(message, detail) { post({ type: 'error', message: String(message), detail: detail == null ? undefined : String(detail) }); }
  function fatal(err, phase) {
    var text = errMsg(err);
    A.bootError = { phase: phase || null, text: text };
    var el = $('fatal');
    if (el) { el.textContent = 'TID Helper error' + (phase ? ' (' + phase + ')' : '') + ': ' + text; el.classList.remove('hidden'); }
    root.__tidHelperError = { phase: phase || null, text: text, stack: err && err.stack ? String(err.stack) : null };
    reportError(text, (phase ? phase + ': ' : '') + (err && err.stack ? err.stack : text));
  }

  // ---- prefs ---------------------------------------------------------------------------------------
  function readLocal() {
    try { if (root.localStorage) { var raw = root.localStorage.getItem(PREFS_KEY); if (raw) { var p = JSON.parse(raw); if (isObj(p)) return p; } } } catch (e) { /* no storage */ }
    return null;
  }
  function writeLocal(p) { try { if (root.localStorage) root.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* no storage */ } }
  function mergePrefs(base, incoming) {
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
    if (isObj(incoming)) Object.keys(incoming).forEach(function (k) { out[k] = incoming[k]; });
    return out;
  }
  function pref(section, key, dflt) {
    var s = A.prefs[section];
    if (!isObj(s) || !(key in s) || s[key] === undefined || s[key] === null) return dflt;
    return s[key];
  }
  function setPref(section, patch) {
    var s = isObj(A.prefs[section]) ? A.prefs[section] : {};
    var next = {};
    Object.keys(s).forEach(function (k) { next[k] = s[k]; });
    Object.keys(patch || {}).forEach(function (k) { if (patch[k] === undefined) delete next[k]; else next[k] = patch[k]; });
    A.prefs[section] = next;
    persistPrefs();
  }
  function persistPrefs() {
    writeLocal(A.prefs);
    post({ type: 'prefs', prefs: A.prefs });
  }
  // calibration stores live inside the prefs (RN keeps them across launches): prefs.cal[key] = {samples, override}
  function cal(key) {
    var all = isObj(A.prefs.cal) ? A.prefs.cal : {};
    var c = all[key];
    return isObj(c) ? { samples: Array.isArray(c.samples) ? c.samples : [], override: typeof c.override === 'number' ? c.override : null } : { samples: [], override: null };
  }
  function setCal(key, next) {
    var all = isObj(A.prefs.cal) ? A.prefs.cal : {};
    var copy = {};
    Object.keys(all).forEach(function (k) { copy[k] = all[k]; });
    copy[key] = { samples: next.samples || [], override: typeof next.override === 'number' ? next.override : null };
    A.prefs.cal = copy;
    persistPrefs();
  }

  // ---- RN -> page ---------------------------------------------------------------------------------
  function receive(msg) {
    if (!isObj(msg) || typeof msg.type !== 'string') { reportError('bridge: message without a type'); return; }
    if (msg.type === 'init') {
      A.initReceived = true;
      A.platformOS = msg.platformOS === 'ios' || msg.platformOS === 'android' ? msg.platformOS : null;
      if (isObj(msg.prefs)) { A.prefs = mergePrefs(A.prefs, msg.prefs); writeLocal(A.prefs); }
      if (A.onInit) { try { A.onInit(); } catch (e) { fatal(e, 'init'); } }
      return;
    }
    log('bridge: unhandled message type ' + msg.type);
  }
  function installBridge() {
    root.TidHelperBridge = { receive: function (m) { receive(m); } };
    var q = root.__tidHelperQueue;
    root.__tidHelperQueue = [];
    if (Array.isArray(q)) q.forEach(function (m) { receive(m); });
  }

  // ---- data binding -----------------------------------------------------------------------------
  function bindData(data, engines) {
    if (!isObj(data)) throw new Error('window.TID_HELPER_DATA is missing');
    for (var i = 0; i < ['gen1', 'gen2', 'gen3sid', 'buffer', 'gen3rs', 'scenes', 'sources'].length; i++) {
      var k = ['gen1', 'gen2', 'gen3sid', 'buffer', 'gen3rs', 'scenes', 'sources'][i];
      if (!isObj(data[k])) throw new Error('TID_HELPER_DATA lacks ' + k);
    }
    if (!engines.G1 || typeof engines.G1.schedule !== 'function') throw new Error('ShinyGen1Tid engine missing');
    if (!engines.G2 || typeof engines.G2.scheduleGen2 !== 'function') throw new Error('ShinyGen2Tid engine missing');
    if (!engines.BD || typeof engines.BD.lookup !== 'function') throw new Error('BufferDecode missing');
    if (!engines.TS || typeof engines.TS.describe !== 'function') throw new Error('TidSources missing');
    engines.TS.bind(data.sources);
    A.D = data; A.G1 = engines.G1; A.G2 = engines.G2; A.BD = engines.BD; A.TS = engines.TS;
    A.fps = { gb: parseFps(data.gen1.fps_expression), gba: parseFps(data.gen3rs.gba_fps_expression) };
    if (Math.abs(A.fps.gb - engines.G1.FPS) > 1e-9) throw new Error('the data fps_expression does not match the engine FPS');
    return A;
  }

  // ---- modes -------------------------------------------------------------------------------------
  // a mode: {id, title, games: [...game keys], line(game) -> one-line status from the data, render(el, game), update?()}
  function registerMode(mode) {
    if (!mode || !mode.id || typeof mode.render !== 'function' || !Array.isArray(mode.games)) throw new Error('registerMode: bad mode');
    A.modes[mode.id] = mode;
    if (A.order.indexOf(mode.id) === -1) A.order.push(mode.id);
  }
  function modesFor(game) { return A.order.map(function (id) { return A.modes[id]; }).filter(function (m) { return m.games.indexOf(game) !== -1; }); }
  function go(screen, game, mode) {
    A.screen = screen; A.game = game == null ? A.game : game; A.mode = mode == null ? A.mode : mode;
    if (screen === 'mode') setPref('nav', { game: A.game, mode: A.mode });
    if (A.onNavigate) A.onNavigate();
  }

  // ---- shared HTML pieces ------------------------------------------------------------------------
  function card(inner, cls) { return '<div class="card' + (cls ? ' ' + cls : '') + '">' + inner + '</div>'; }
  function statusBlock(rows) {
    // rows: [[label, text]] - every text is the data's own; the label is the page's
    return '<div class="status">' + rows.filter(function (r) { return r && r[1]; }).map(function (r) {
      return '<div class="srow"><span class="sl">' + esc(r[0]) + '</span><span class="sv">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
  }
  function choices(name, items, active) {
    return '<div class="choices">' + items.map(function (it) {
      return '<button type="button" class="choice' + (it.id === active ? ' active' : '') + '" data-choice="' + esc(name) + '" data-id="' + esc(it.id) + '">' +
        '<span class="ct">' + esc(it.title) + '</span>' + (it.sub ? '<span class="cs">' + esc(it.sub) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function select(id, items, value, label) {
    return (label ? '<label class="field">' + esc(label) : '') + '<select id="' + esc(id) + '">' + items.map(function (it) {
      return '<option value="' + esc(it.id) + '"' + (it.id === value ? ' selected' : '') + '>' + esc(it.title) + '</option>';
    }).join('') + '</select>' + (label ? '</label>' : '');
  }
  // the source block under a Trainer ID result: the citation module decides the outcome (documented / community /
  // derived) and supplies every word of the label and the text; this only lays it out. External links carry data-ext so
  // the app can hand them to the system browser (page-render.js) while the website opens them in a new tab.
  function linkHtml(url, text) { return '<a href="' + esc(url) + '" data-ext="1" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>'; }
  function sourceEntryHtml(e) {
    var meta = e.author + (e.date ? ', ' + String(e.date).slice(0, 4) : '') + (e.kind !== 'video' ? ' (' + e.kind + ')' : '');
    var h = '<li>' + linkHtml(e.url, e.title) + ' <span class="small muted">' + esc(meta) + '</span>';
    if (e.what) h += '<span class="sm">' + esc(e.what) + '</span>';
    if (e.sequence) h += '<span class="sm mono">' + esc(e.sequence) + '</span>';
    if (e.console) h += '<span class="sm muted">Console: ' + esc(e.console) + '</span>';
    if (e.note) h += '<span class="sm muted">' + esc(e.note) + '</span>';
    if (e.route) h += '<span class="sm">Route doc: ' + linkHtml(e.route.url, e.route.title) + '</span>';
    return h + '</li>';
  }
  function sourcesHtml(game, tid, provenance) {
    if (!A.TS) return '';
    var d = A.TS.describe(game, tid, provenance);
    var cls = d.kind === 'documented' ? ' ok' : d.kind === 'derived' ? ' warn' : '';
    var h = '<div class="src"><p><span class="tag' + cls + '">' + esc(d.label) + '</span> <span class="small muted">' + esc(d.text) + '</span></p>';
    if (d.entries.length) h += '<ul class="srcs">' + d.entries.map(sourceEntryHtml).join('') + '</ul>';
    return h + '</div>';
  }
  // a tool credit under a cue or timer: the community programs this page's own cue stands in for (the registry's tools
  // block: EonTimer for the Gen 3-5 timers, FlowTimer for the Gen 1-2 speedrun manips). lead is the page's sentence.
  function toolsHtml(ids, lead) {
    if (!A.TS) return '';
    var ts = ids.map(function (id) { return A.TS.tool(id); }).filter(Boolean);
    if (!ts.length) return '';
    return '<p class="small muted tools">' + (lead ? esc(lead) + ' ' : '') + ts.map(function (t) {
      var h = linkHtml(t.url, t.name) + ' (' + esc(t.author) + ')';
      if (t.links && t.links.length) h += ' [' + t.links.map(function (l) { return linkHtml(l.url, l.title); }).join(', ') + ']';
      return h + ': ' + esc(t.what);
    }).join(' ') + '</p>';
  }
  // the per-game card every mode appends before its status card: the sources that document the method itself
  function sourcesCard(game) {
    if (!A.TS) return '';
    var gen = A.TS.general(game), L = A.D.sources.labels;
    var h = '<h3>Sources</h3><p class="small muted">Type a Trainer ID above and its result says where it comes from: ' + esc(L.documented.label) + ' names a published manipulation of that exact ID; ' + esc(L.community.label) + ' and ' + esc(L.derived.label) + ' mean none is on record here.</p>';
    if (gen.length) h += '<p class="small">On the method for ' + esc(A.TS.gameName(game)) + ':</p><ul class="srcs">' + gen.map(sourceEntryHtml).join('') + '</ul>';
    h += toolsHtml(['eontimer', 'flowtimer'], 'Timers: the beeps and flashes on this page are Hackmons Hub\'s own cue engine standing in for the community\'s timer programs, which the published offsets are written for.');
    return card(h);
  }
  function details(summary, inner, open) { return '<details' + (open ? ' open' : '') + '><summary>' + esc(summary) + '</summary>' + inner + '</details>'; }
  function list(items, cls) { return '<ol class="' + (cls || 'steps') + '">' + items.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>'; }

  A.$ = $; A.esc = esc; A.hex4 = hex4; A.hex8 = hex8; A.fmtS = fmtS; A.fmtMs = fmtMs; A.fmtSigned = fmtSigned; A.pct = pct; A.fmtTid = fmtTid;
  A.errMsg = errMsg; A.parseFps = parseFps; A.clamp = clamp; A.isObj = isObj;
  A.post = post; A.log = log; A.reportError = reportError; A.fatal = fatal;
  // Restore prefs from the localStorage mirror at load. Until now the only reader was the
  // React Native bridge's init message, so the mobile app restored fine and the website -
  // which has no bridge - forgot every setting on every reload: game, Trainer ID, platform,
  // calibration samples. The bridge still merges RN's copy on top, so RN stays authoritative
  // when it is there; this just means the page never starts from nothing when a mirror exists.
  A.prefs = mergePrefs(A.prefs, readLocal());
  A.readLocal = readLocal; A.mergePrefs = mergePrefs; A.pref = pref; A.setPref = setPref; A.persistPrefs = persistPrefs; A.cal = cal; A.setCal = setCal;
  A.receive = receive; A.installBridge = installBridge; A.bindData = bindData;
  // ---- "what did you get?" and the correction it implies --------------------------------------------
  // ONE implementation for every mode, because the reasoning is the same everywhere and only the lookup
  // differs. A mode supplies locate(got) - "which press does that result correspond to" - and gets the
  // attempt list, the per-attempt advice, the running recommendation and the Use-it button for free.
  //
  // WHY THE CORRECTION ALREADY APPLIED IS ADDED BACK. If you are 10 frames late, dial in -10 frames and
  // are then 3 frames late, your intrinsic lateness is 13, not 3. Averaging the raw errors would chase
  // the answer in ever-smaller steps and never arrive. Averaging (error - correctionApplied) converges
  // in one round, which is the whole point of recording the correction alongside each attempt.
  //
  // WHY ATTEMPTS ARE KEYED BY TARGET. The correction is a fact about the runner's reaction time and is
  // worth carrying between targets, but the ERRORS are measured against one route's geometry, so they
  // are kept per target and only the resulting millisecond figure is portable.
  var ATT = {};
  function attKey(o) { return 'tries.' + o.game + '.' + o.targetKey; }
  ATT.list = function (o) { var v = pref(o.section, attKey(o)); return Array.isArray(v) ? v : []; };
  ATT.set = function (o, list) { var patch = {}; patch[attKey(o)] = list; setPref(o.section, patch); };
  // SIGN. The house convention, set by page-gen1-buffer.js ("every beep this much earlier") and
  // page-gen3-rs.js and pinned by rs.test.cjs, is that the cue fires at press - correction: a POSITIVE
  // correction cues EARLIER. So a runner who presses late needs a POSITIVE number, and the correction
  // already applied has moved them EARLIER by that many frames, which is why it is ADDED to the observed
  // error to recover the intrinsic lateness rather than subtracted.
  //
  // Both of those signs were inverted until 2026-09-20 and the two errors did not cancel - they compounded.
  // A runner 18 frames late was told -170 ms, which cued him 10 frames LATER; the next attempt measured 28
  // frames late, which the same inverted add-back read as 38 frames of intrinsic lateness and answered with
  // -639 ms. Four rounds took the advice from -170 to -2151 ms and the error from 28 to 116 frames late.
  // Any change here must keep the closed-loop test in correction-advice.test.cjs passing: it drives a
  // simulated runner through several rounds and requires the error to CONVERGE.
  // attempts that locate() could place on the timed axis, converted to intrinsic error in frames
  ATT.recommend = function (o) {
    var msPerFrame = 1000 / o.fps, used = [];
    ATT.list(o).forEach(function (t) {
      var d = o.locate(t.got);
      if (!d || (d.kind !== 'timing' && d.kind !== 'target')) return;
      var err = d.kind === 'target' ? 0 : d.errorFrames;
      used.push(err + (Number(t.corrMs) || 0) / msPerFrame);
    });
    if (!used.length) return { n: 0, msPerFrame: msPerFrame };
    var sum = 0, lo = used[0], hi = used[0];
    used.forEach(function (u) { sum += u; if (u < lo) lo = u; if (u > hi) hi = u; });
    var mean = sum / used.length;
    return { n: used.length, meanFrames: mean, spreadFrames: hi - lo, msPerFrame: msPerFrame,
             ms: Math.round(mean * msPerFrame) };
  };
  ATT.panelHtml = function (o) {
    var id = o.idPrefix, list = ATT.list(o), rec = ATT.recommend(o), out = [];
    out.push('<p class="small"><b>What did you get?</b> Type the ' + esc(o.noun || 'Trainer ID') + ' the run actually '
      + 'produced. The correction in the box is recorded with it, so the advice stays right as you change it.</p>');
    out.push('<div class="row"><label class="field">' + esc(o.noun || 'Trainer ID') + ' you got'
      + '<input type="text" inputmode="numeric" id="' + id + '-got" placeholder="' + esc(o.placeholder || 'e.g. 27355 or $6ADB') + '"></label>'
      + '<button type="button" id="' + id + '-add">Add</button></div>');
    if (list.length) {
      out.push('<ul class="plain small">' + list.map(function (t, i) {
        var d = o.locate(t.got) || { kind: 'unknown' };
        var head = '<b>' + esc(fmtTid(t.got)) + '</b>'
          + (t.corrMs ? ' <span class="muted">(correction ' + (t.corrMs > 0 ? '+' : '') + Math.round(t.corrMs) + ' ms)</span>' : '');
        var body;
        if (d.kind === 'target') body = ' - <b>that is the target.</b>';
        else if (d.kind === 'timing') {
          var n = d.errorFrames, late = n > 0;
          body = ' - ' + (d.note ? esc(d.note) + '; ' : '') + 'the press was <b>' + Math.abs(n) + ' frame'
            + (Math.abs(n) === 1 ? '' : 's') + ' ' + (late ? 'LATE' : 'EARLY') + '</b> ('
            + (late ? '+' : '-') + Math.abs(n * rec.msPerFrame).toFixed(0) + ' ms).';
        } else body = ' - ' + esc(d.note || 'this table cannot say where that came from.');
        return '<li>' + head + body + ' <button type="button" class="link" data-' + id + '-drop="' + i + '">remove</button></li>';
      }).join('') + '</ul>');
    }
    if (rec.n) {
      var same = Math.abs((Number(o.corrMs) || 0) - rec.ms) < 1;
      out.push('<p class="small"><b>Recommended correction: ' + (rec.ms > 0 ? '+' : '') + rec.ms + ' ms</b>'
        + ' <span class="muted">(from ' + rec.n + ' timed attempt' + (rec.n === 1 ? '' : 's') + ': you press on average '
        + Math.abs(rec.meanFrames).toFixed(1) + ' frames ' + (rec.meanFrames >= 0 ? 'late' : 'early')
        + ', spread ' + rec.spreadFrames.toFixed(1) + ' frames)</span>'
        + (same ? ' <span class="muted">- already applied.</span>' : ' <button type="button" id="' + id + '-usecorr">Use it</button>') + '</p>');
      if (rec.n < 3) out.push('<p class="small muted">Two or three more attempts will make this worth trusting; one is a guess.</p>');
      if (o.windowFrames && rec.spreadFrames > o.windowFrames * 2)
        out.push('<p class="small muted">Your spread is wider than the ' + o.windowFrames + '-frame window, so a correction '
          + 'alone will not land it every time - it moves the middle of your scatter onto the target.</p>');
    } else if (list.length) {
      out.push('<p class="small muted">None of those could be placed on the timed axis, so there is nothing to correct yet.</p>');
    }
    if (list.length) out.push('<p class="small"><button type="button" id="' + id + '-clear">Clear attempts</button></p>');
    return out.join('');
  };
  // Returns 'render' when the caller should re-render, null when it handled nothing (or handled it in
  // place). A typed-in field NEVER returns 'render': that rebuilds the card and closes the keyboard.
  ATT.onEvent = function (ev, o) {
    var id = o.idPrefix;
    if (ev.type !== 'click') return (ev.target && ev.target.id === id + '-got') ? null : undefined;
    var t = ev.target; if (!t) return undefined;
    if (t.id === id + '-add') {
      var box = $(id + '-got'), got = box ? o.parse(box.value) : null;
      if (got == null) return null;
      var l = ATT.list(o).slice(); l.push({ got: got, corrMs: Number(o.corrMs) || 0 });
      ATT.set(o, l); return 'render';
    }
    var drop = t.closest && t.closest('[data-' + id + '-drop]');
    if (drop) { var l2 = ATT.list(o).slice(); l2.splice(Number(drop.getAttribute('data-' + id + '-drop')), 1); ATT.set(o, l2); return 'render'; }
    if (t.id === id + '-clear') { ATT.set(o, []); return 'render'; }
    if (t.id === id + '-usecorr') {
      var rec = ATT.recommend(o);
      if (!rec.n || typeof o.setCorr !== 'function') return null;
      o.setCorr(rec.ms); return 'render';
    }
    return undefined;
  };
  // ---- signed number fields ------------------------------------------------------------------------
  // A phone's numeric keypad has NO MINUS KEY. `inputmode="numeric"` asks for exactly that keypad, so
  // every signed field in this app was unreachable below zero on the device it is built for: the owner
  // could only go negative by tapping "1 frame earlier" repeatedly, ten or twenty times. Desktop browsers
  // show a full keyboard, which is why this survived so long.
  //
  // The button does not persist anything itself. It flips the field and fires the SAME 'input' event that
  // typing fires, so whatever already stores that field stores this too - one mechanism, and a page cannot
  // acquire a sign button that silently fails to save.
  //
  // A BLANK FIELD STAYS BLANK. Some of these treat empty as "unset" ("Override (ms, blank = use the mean)"),
  // and turning that into "0" would quietly change the meaning rather than the sign.
  function flippedValue(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (t === '') return '';                       // blank is a value, not zero
    var n = Number(t);
    if (!isFinite(n)) return t;                    // a half-typed number: leave it alone
    if (n === 0) return t;                         // -0 reads as 0; flipping it is a no-op, not a rewrite
    return String(-n);
  }
  // `label` is optional: the default reads as what it does rather than as a maths symbol.
  function signButtonHtml(inputId, label) {
    return '<button type="button" class="signflip secondary small" data-sign="' + esc(inputId) + '"'
      + ' aria-label="make the value above positive or negative">' + esc(label || '+ / -') + '</button>';
  }
  function flipSign(inputId) {
    var el = $(inputId);
    if (!el) return false;
    var next = flippedValue(el.value);
    if (next === el.value) return false;
    el.value = next;
    var ev;
    try { ev = new Event('input', { bubbles: true }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent('input', true, false); }
    el.dispatchEvent(ev);
    return true;
  }
  A.flippedValue = flippedValue; A.signButtonHtml = signButtonHtml; A.flipSign = flipSign;

  A.attempts = ATT;

  A.registerMode = registerMode; A.modesFor = modesFor; A.go = go;
  A.card = card; A.statusBlock = statusBlock; A.choices = choices; A.select = select; A.details = details; A.list = list;
  A.sourcesHtml = sourcesHtml; A.sourcesCard = sourcesCard; A.linkHtml = linkHtml; A.toolsHtml = toolsHtml;
  return A;
});
