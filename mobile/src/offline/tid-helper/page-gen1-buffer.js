// TID Helper page: the Gen 1 "buffer guide" (Red / Blue / Yellow). A typed Trainer ID, or a target set, becomes the
// list's own buffered-input sequences (gen1-buffer.json, decoded by buffer-decode.js), rendered as numbered steps whose
// every line is the data's grammar (means / window / citation), with the data's power-on-to-roll time and the
// per-sequence verification tag in the data's own words; the storyboard is the composed windows-model timeline
// anchored on the Nintendo logo. UMD: the pure part (TidHelperGen1Buffer) runs under node; the UI registers itself on
// TidHelperApp when the page is present.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperGen1Buffer = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  function platformsFor(D, game) { return D.buffer.games[game] ? Object.keys(D.buffer.games[game]) : []; }
  // the data's own words for a verification letter, lifted from encoding.entry ("v = one char: b (...), h (...), l (...)")
  function verificationText(D, v) {
    var m = new RegExp('(?:^|[^a-z])' + v + ' \\(([^)]*)\\)').exec(D.buffer.encoding.entry);
    if (!m) fail('gen1-buffer.json encoding.entry does not describe v = ' + v);
    return m[1];
  }
  // token -> the grammar entry that describes it (base) and, for the composite tokens, the modifier entry
  function grammarKeys(D, token, game) {
    var g = D.buffer.grammar, m;
    if (g[token]) return { base: token, modifier: null };
    if ((m = /^(hop|intro)(\d)(?:\((reset)\))?$/.exec(token))) return { base: m[1] === 'hop' ? 'hopN' : 'introN', modifier: m[3] ? 'hopN(reset)' : null };
    if (token === 'introwait') return { base: 'introN', modifier: null };
    if ((m = /^title(\d)(?:\((scroll|reset|scrollreset|usb|scrollusb)\))?$/.exec(token))) { var k = 'titleN' + (m[2] ? '(' + m[2] + ')' : ''); if (!g[k]) fail('no grammar entry ' + k); return { base: k, modifier: null }; }
    if ((m = /^title\((reset|usb)\)$/.exec(token))) return { base: 'title', modifier: 'titleN(' + m[1] + ')' };
    fail('no grammar entry for token ' + JSON.stringify(token) + (game ? ' (' + game + ')' : ''));
  }
  function isResetToken(t) { return /reset|usb/.test(t); }
  // ONE decision about what a token asks the runner to DO, shared by the step list and the cue. They used to
  // decide separately, and disagreed: steps() knew that hop0 straight after gfskip is the Game Freak skip simply
  // still being held (the hopN grammar says so, three hundred characters in), while cueProgram saw only a window
  // band and sounded a press tone on it - on the one step in the route where an extra press moves the Trainer ID,
  // into a 50 ms window. introwait was worse still: the grammar defines it as "let the whole intro play" and BOTH
  // the step list and the cue called it a press. A token listed here asks for no new input; everything else does.
  // The list is code rather than data because the grammar states it in prose, so a test ties each member back to
  // the sentence in gen1-buffer.json that says it: see gen1-buffer-cue.test.cjs.
  var KEEP_TOKENS = { hop6: 1, gfwait: 1, introwait: 1, nopal: 1 };
  function tokenAct(toks, i) {
    var tok = toks[i];
    if (KEEP_TOKENS[tok]) return 'keep';
    if (tok === 'hop0' && i > 0 && toks[i - 1] === 'gfskip') return 'keep';
    return 'press';
  }
  function keepLabel(tok, toks, i) {
    if (tok === 'hop0') return 'keep holding';
    return 'touch nothing';
  }
  // nopal was left out of the list at first because its boot band already carries act 'nothing', so no press tone
  // ever sounded on it - but tokenAct is also what the step list and the cue note count with, and both were
  // calling it a press. The grammar is plain: "Touch nothing while the Nintendo logo is on screen after
  // power-on. Any button pressed in that window changes the ID."

  // the numbered steps of a sequence: the palette (boot) step first, every line the grammar's
  function steps(D, game, platform, seq) {
    var toks = seq.split('_'), out = [], g = D.buffer.grammar, bootW = D.buffer.windows.boot[platform] || {};
    var pal = { nopal: 1, pal: 1, 'nopal(ab)': 1, 'pal(hold)': 1, 'pal(ab)': 1 };
    if (!pal[toks[0]]) out.push({ n: 1, token: '(boot)', kind: 'boot-note', means: bootW.note || D.buffer.windows.boot.note, window: '', citation: '', modifier: null });
    toks.forEach(function (tok, ti) {
      var k = grammarKeys(D, tok, game), b = g[k.base], mod = k.modifier ? g[k.modifier] : null;
      // hop0 straight after gfskip is a CONTINUATION, not a press: the Up+Select+B that
      // skipped the Game Freak logo is simply still held. The hopN family text says so,
      // but 300 characters in, where the step list has long since truncated - so the step
      // read "Press A (or START) during the Nidorino/Gengar scene" and an extra press in
      // that scene moves the roll. Context cannot live in a grammar entry, so it is here;
      // hop6 (the do-nothing member) now has an entry of its own in the data.
      var act = tokenAct(toks, ti), held = act === 'keep' && tok === 'hop0';
      var means = held
        ? 'Do not press anything new: keep Up+Select+B held from the Game Freak skip straight into the scene. It registers on the walk-in poll by itself.'
        : b.means;
      out.push({ n: out.length + 1, token: tok, act: act, kind: pal[tok] ? 'boot' : (isResetToken(tok) ? 'reset' : (act === 'keep' ? 'hold' : 'press')), grammarKey: k.base, means: means, window: b.window, citation: b.citation,
        modifier: mod ? { key: k.modifier, means: mod.means, window: mod.window, citation: mod.citation } : null });
    });
    return out;
  }
  function decorate(D, game, platform, entry) {
    return { seq: entry.seq, s: entry.s, seconds: entry.s / 100, v: entry.v, verification: verificationText(D, entry.v), win: entry.win, tokens: entry.seq.split('_'),
      resetFree: !entry.seq.split('_').some(isResetToken), hasWindows: entry.win !== null && entry.win !== undefined };
  }
  function lookup(D, BD, game, platform, tid) {
    if (!D.buffer.games[game] || !D.buffer.games[game][platform]) fail('no buffer table for ' + game + '/' + platform);
    var l = BD.lookup(D.buffer, game, platform, tid);
    if (!l) return null;
    return { tid: tid, entries: l.entries.map(function (e) { return decorate(D, game, platform, e); }) };
  }
  // target sets: every set in gen1-buffer.json has the gen1-tid.json shape (games, kind list with hex strings or highbyte with hi)
  function setsFor(D, game) {
    var out = [];
    Object.keys(D.buffer.target_sets).forEach(function (k) {
      var s = D.buffer.target_sets[k];
      if (!Array.isArray(s.games)) fail('gen1-buffer.json target set ' + k + ' has no games list');
      if (s.games.indexOf(game) !== -1) out.push({ key: k, name: s.name, tids: expandSet(s), kind: s.kind || 'list', route: s.route || '', provenance: s.provenance || '', sameMembersAs: s.same_members_as || null });
    });
    // A set the data marks as same_members_as another offered set is the same 256 IDs under a second name
    // (red-2swap = hi40-corruption): offer the pair ONCE, under the alias's name, and say which key it stands for,
    // so the picker never lists identical membership twice. Data-driven: only same_members_as decides.
    var aliased = {};
    out.forEach(function (t) { if (t.sameMembersAs) aliased[t.sameMembersAs] = t; });
    return out.filter(function (t) { return !aliased[t.key]; }).map(function (t) {
      if (t.sameMembersAs) t.name = t.name + ' (same members as ' + t.sameMembersAs + ')';
      return t;
    });
  }
  function expandSet(s) {
    if (s.kind === 'highbyte') { var hi = parseInt(String(s.hi), 16), r = []; for (var i = 0; i < 256; i++) r.push(hi * 256 + i); return r; }
    return (s.tids || []).map(function (t) { return typeof t === 'number' ? t : parseInt(String(t), 16); });
  }
  var tableCache = {};
  function table(D, BD, game, platform) {
    var key = game + '/' + platform;
    if (!tableCache[key]) {
      var gp = D.buffer.games[game] && D.buffer.games[game][platform];
      if (!gp) fail('no buffer table for ' + key);
      var rows = BD.unpack(gp.packed, game, D.buffer.windows.games[game][platform].scenes.title), byTid = {};
      rows.forEach(function (r) { byTid[r.tid] = r.entries; });
      tableCache[key] = byTid;
    }
    return tableCache[key];
  }
  // the simplest sequences reaching a member of the set: reset-free first, then fewest tokens, then the lowest time
  function setSearch(D, BD, game, platform, setKey, limit) {
    var sets = setsFor(D, game).filter(function (s) { return s.key === setKey; });
    if (!sets.length) fail('target set ' + setKey + ' is not offered for ' + game);
    var t = table(D, BD, game, platform), rows = [];
    sets[0].tids.forEach(function (tid) {
      var ents = t[tid];
      if (!ents || !ents.length) return;
      rows.push({ tid: tid, entry: decorate(D, game, platform, ents[0]) });
    });
    rows.sort(function (a, b) {
      if (a.entry.resetFree !== b.entry.resetFree) return a.entry.resetFree ? -1 : 1;
      if (a.entry.tokens.length !== b.entry.tokens.length) return a.entry.tokens.length - b.entry.tokens.length;
      return a.entry.s - b.entry.s;
    });
    return { set: sets[0], covered: rows.length, rows: rows.slice(0, Math.max(10, limit || 10)) };
  }
  // every token kind the encoding can produce (single codes, numbered codes with every digit, the digits), for the grammar test
  function encodableTokens(D, game) {
    var enc = D.buffer.encoding.tokens, out = [], hw = game === 'yellow' ? 'intro' : 'hop';
    Object.keys(enc.single).forEach(function (c) { out.push(enc.single[c]); });
    for (var d = 0; d <= 6; d++) out.push(hw + d);
    Object.keys(enc.numbered).forEach(function (c) {
      for (var n = 0; n <= 9; n++) {
        if (c === 'R') out.push(hw + n + '(reset)');
        else out.push(enc.numbered[c].replace('N', String(n)));
      }
    });
    return out;
  }
  // A window narrower than this has less room in it than a person's reaction to a sound, so the step list says so
  // rather than letting the runner find out. It is a property of people, not of the game, and is used only to
  // decide what to warn about: no cue time is computed from it.
  var TIGHT_MS = 200;
  // The cue program for a composed timeline.
  //   - a press window is aimed at its MIDDLE, not its opening edge. Every frame from the window opening to the
  //     poll that reads it gives the same Trainer ID (the hopN grammar: "the press registers at the window's
  //     first poll"), so the middle is the point with the most room either side. Sounding on the opening edge
  //     spent the whole window on the runner's reaction - and on Yellow's 117-167 ms windows there was none of
  //     it left - while the correction that might have covered that reaction defaulted to zero.
  //   - a step that asks for NO new input (tokenAct 'keep') gets a low hold tone that says what to keep doing.
  //     It used to get the same press tone as everything else.
  //   - boot (palette) steps are cued now. pal(ab) asks for A or B inside frames 70-85 - 251 ms - and had no cue
  //     at all, while its band on screen showed the two-and-a-half second direction hold instead of the press.
  //   - a count-in of `beeps` tones `spacingS` apart runs into the first cue, so the runner is on the beat before
  //     the first window rather than reacting to it cold. Tones that would fall before the anchor are dropped and
  //     counted, as the Gen 1 timed schedule drops its own.
  // correctionMs shifts every cue earlier (the runner's reaction plus the audio path's own delay).
  function cueProgram(G1, tl, correctionMs, beeps, spacingS) {
    var cues = [], corr = (correctionMs || 0) / 1000, dropped = 0;
    var toks = (tl.steps || []).map(function (st) { return st.token; });
    (tl.inputs || []).forEach(function (b) {
      if (b.kind === 'window') {
        var act = tokenAct(toks, b.step), tok = toks[b.step];
        if (act === 'keep') { cues.push({ t: b.t0 - corr, freq: G1.HOLD_TONE[0], ms: G1.HOLD_TONE[1], label: keepLabel(tok, toks, b.step), kind: 'keep', token: tok }); return; }
        var ng = b.text === 'newgame', aim = b.regT == null ? b.t0 : (b.t0 + b.regT) / 2;
        cues.push({ t: aim - corr, freq: ng ? G1.A_CUE_TONE[0] : G1.MENU_MARK_TONE[0], ms: ng ? G1.A_CUE_TONE[1] : G1.MENU_MARK_TONE[1],
          label: ng ? 'A' : b.text, kind: ng ? 'A' : 'mark', token: tok, windowS: b.regT == null ? null : b.regT - b.t0 });
      } else if (b.kind === 'boot') {
        if (b.act !== 'press' && b.act !== 'release') return;      // a direction held from power-on is already held; nothing to sound
        cues.push({ t: (b.t0 + b.t1) / 2 - corr, freq: G1.MENU_MARK_TONE[0], ms: G1.MENU_MARK_TONE[1], label: b.text, kind: 'mark', token: b.token, windowS: b.t1 - b.t0 });
      } else if (b.kind === 'run') {
        cues.push({ t: b.t0 - corr, freq: G1.HOLD_TONE[0], ms: G1.HOLD_TONE[1], label: 'touch nothing', kind: 'keep', token: b.text });
      }
    });
    // No correction on this one: the correction exists to put a press where it belongs, and there is no press
    // here. A low tone and a plain flash, so it cannot be mistaken for the route's press marks - it used to
    // carry both of theirs.
    if (tl.roll) cues.push({ t: tl.roll.t, freq: G1.RESET_BEAT_TONE[0], ms: G1.RESET_BEAT_TONE[1], label: 'rolled', kind: 'rolled' });
    cues.sort(function (a, b) { return a.t - b.t; });
    var before = cues.length;
    cues = cues.filter(function (c) { return c.t >= 0; });          // the anchor is the logo: a cue in the past cannot sound
    dropped += before - cues.length;
    var droppedCountIn = 0;
    var n = beeps == null ? 0 : Math.max(0, Math.floor(beeps)), sp = spacingS > 0 ? spacingS : 1.0;
    // into the first thing the runner must DO. It used to count into cues[0], which on a route opening with
    // gfwait or hop6 is a "touch nothing" tone - so on about a quarter of the routes the run-up led to a step
    // whose whole instruction is to leave the pad alone, and then stopped before the first real press.
    var firstAct = null;
    for (var ai = 0; ai < cues.length; ai++) if (cues[ai].kind === 'mark' || cues[ai].kind === 'A') { firstAct = cues[ai].t; break; }
    if (n && firstAct !== null) {
      var first = firstAct, ci = [];
      for (var k = n; k > 0; k--) { var t = first - k * sp; if (t >= 0) ci.push({ t: t, freq: G1.COUNT_IN_TONE[0], ms: G1.COUNT_IN_TONE[1], label: 'count-' + k, kind: 'count' }); else droppedCountIn++; }
      // re-sorted, not just prepended: now that the run-up is anchored on the first PRESS, a "touch nothing"
      // tone earlier in the route can fall between the count beeps, and the clock readout walks this array in
      // order to name the next cue.
      var merged = ci.concat(cues);
      merged.sort(function (a, b) { return a.t - b.t; });
      merged.droppedCues = cues.droppedCues;
      cues = merged;
      cues.firstStepT = first;
    }
    // kept apart on purpose: a step that falls before the anchor is a route this anchor cannot cue at all, while
    // a dropped count-in beep only means the first step comes too soon after the logo for a full run-up.
    cues.droppedCues = dropped;
    cues.droppedCountIn = droppedCountIn;
    return cues;
  }

  // WHAT A WRONG RESULT TELLS YOU. This mode had no way to report an attempt back, so a runner who got the
  // wrong Trainer ID learned nothing from it and the page could not tell them which step to look at. There is
  // no correction to tune here - a buffer route is a list of presses, not an offset, so the Gen 1 timed mode's
  // implied-correction arithmetic does not apply and none is invented. What CAN be derived from the table the
  // page already carries is which routes produce the ID that came out, and where the earliest of them parts
  // company with the route that was run. That narrows the step to look at; it does not prove anything, because
  // several different mistakes can land on the same Trainer ID, and the sentence below says so.
  function diagnose(D, BD, game, platform, ranSeq, gotTid) {
    var l = lookup(D, BD, game, platform, gotTid);
    if (!l) return { tid: gotTid, known: false };
    var ran = ranSeq.split('_'), best = null;
    l.entries.forEach(function (e) {
      var got = e.seq.split('_'), i = 0;
      while (i < ran.length && i < got.length && ran[i] === got[i]) i++;
      var cand = { seq: e.seq, tokens: got, shared: i, ranToken: i < ran.length ? ran[i] : null, gotToken: i < got.length ? got[i] : null, v: e.v, verification: e.verification };
      if (!best || cand.shared > best.shared) best = cand;
    });
    return { tid: gotTid, known: true, entries: l.entries, nearest: best, sameRoute: best && best.seq === ranSeq };
  }
  var pure = { platformsFor: platformsFor, diagnose: diagnose, verificationText: verificationText, grammarKeys: grammarKeys, steps: steps, lookup: lookup, setsFor: setsFor, expandSet: expandSet, setSearch: setSearch, encodableTokens: encodableTokens, cueProgram: cueProgram, isResetToken: isResetToken, table: table, tokenAct: tokenAct, KEEP_TOKENS: KEEP_TOKENS, TIGHT_MS: TIGHT_MS };

  // ---- UI --------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc;
    function p(k, d) { return A.pref('buffer', k, d); }
    function platformKey(game) { var ps = platformsFor(A.D, game), want = p('platform', 'gbp'); return ps.indexOf(want) !== -1 ? want : ps[0]; }
    function stepsHtml(game, platform, seq) {
      var st = steps(A.D, game, platform, seq);
      return '<ol class="steps">' + st.map(function (s) {
        var h = '<li' + (s.kind === 'reset' ? ' class="reset"' : '') + '><span class="st">' + esc(s.token) + '</span>' + (s.kind !== 'boot-note' ? ' <span class="muted small">(' + esc(s.kind) + ')</span>' : '') +
          '<span class="sm">' + esc(s.means) + '</span>' + (s.window ? '<span class="sw">Window: ' + esc(s.window) + '</span>' : '') + (s.citation ? '<span class="sc">' + esc(s.citation) + '</span>' : '');
        if (s.modifier) h += '<span class="mod"><span class="muted small">Modifier (grammar ' + esc(s.modifier.key) + '):</span><span class="sm">' + esc(s.modifier.means) + '</span>' + (s.modifier.window ? '<span class="sw">Window: ' + esc(s.modifier.window) + '</span>' : '') + '</span>';
        return h + '</li>';
      }).join('') + '</ol>';
    }
    function entryHtml(game, platform, tid, e, idx) {
      var id = 'bstory-' + idx;
      var reason = e.hasWindows ? null : 'This row is ' + e.v + ' (' + e.verification + '): the data carries no measured title windows for it, so no timeline can be composed; the windows model gives bounds only. The steps above are the sequence; the storyboard needs a harness-measured row.';
      return A.card('<h3>Sequence ' + (idx + 1) + ' for ' + esc(A.fmtTid(tid)) + '</h3>' +
        '<p class="mono small">' + esc(e.seq) + '</p>' +
        // b and l are both community-list rows and read as confirmed; h is ours alone.
        // This used to be the other way round - l was the warning and h had no tag at
        // all - which made an unreproduced harness row look safer than a row the
        // community has published.
        '<p><span class="tag ' + (e.v === 'h' ? 'warn' : 'ok') + '">' + esc(e.v) + ': ' + esc(e.verification) + '</span> ' +
        (e.resetFree ? '' : '<span class="tag warn">needs a soft reset mid-sequence</span> ') +
        '<span class="small muted">' + esc(e.tokens.length) + ' tokens, ' + (e.resetFree ? 'reset-free' : 'reset-family') + '; s = ' + e.s + ' (' + e.seconds.toFixed(2) + ' s: ' + esc(sText(A.D)) + ')</span></p>' +
        stepsHtml(game, platform, e.seq) +
        cueNoteHtml(game, platform, e) +
        A.widgets.storyWidgetHtml(id, 'the Nintendo logo', reason));
    }
    function sText(D) { var m = /s = ([^|]*)\|/.exec(D.buffer.encoding.entry); return m ? m[1].trim() : 'centiseconds'; }
    // What the cue will actually do for THIS sequence, in its own numbers: where it aims, how much room the
    // worst step leaves, and which steps it will deliberately not sound a press on. Written from the same
    // program the Run button plays, so it cannot drift from it.
    function cueNoteHtml(game, platform, e) {
      if (!e.hasWindows) return '';
      var tl, cues;
      try {
        tl = A.Story.bufferTimeline(A.D, A.BD, game, platform, e);
        cues = cueProgram(A.G1, tl, Number(p('correctionMs', 0)) || 0, Number(p('beeps', A.D.gen1.defaults.count_in_beeps)) || 0, A.D.gen1.defaults.count_in_spacing_s);
      } catch (err) { return '<p class="small warn">No cue for this row: ' + esc(A.errMsg(err)) + '</p>'; }
      var timed = cues.filter(function (c) { return c.windowS != null; });
      var tightest = null;
      timed.forEach(function (c) { if (!tightest || c.windowS < tightest.windowS) tightest = c; });
      var keeps = cues.filter(function (c) { return c.kind === 'keep'; });
      var h = '<p class="small muted">The cue sounds in the MIDDLE of each window, not at its edge: every frame from a window opening to the poll that reads it gives the same Trainer ID, so the middle leaves the most room either side.';
      if (tightest) h += ' Tightest step here: <b>' + esc(tightest.label) + '</b>, ' + Math.round(tightest.windowS * 1000) + ' ms' + (tightest.windowS * 1000 < TIGHT_MS ? ' - less than a typical reaction to a sound, so ride the count-in rather than the beep' : '') + '.';
      if (keeps.length) h += ' ' + keeps.length + ' step' + (keeps.length === 1 ? '' : 's') + ' (' + keeps.map(function (c) { return esc(c.token || c.label); }).join(', ') + ') ask' + (keeps.length === 1 ? 's' : '') + ' for no new input: those get a low tone that says keep going, never a press tone.';
      if (cues.droppedCues) h += ' <b>' + cues.droppedCues + ' step' + (cues.droppedCues === 1 ? '' : 's') + ' of this route fall before the Nintendo logo</b> and cannot be cued from this anchor at all: do those from the step list above.';
      if (cues.droppedCountIn) h += ' The count-in is ' + cues.droppedCountIn + ' beep' + (cues.droppedCountIn === 1 ? '' : 's') + ' short because the first step comes only ' + (cues.firstStepT == null ? '' : cues.firstStepT.toFixed(2) + ' s ') + 'after the logo.';
      return h + '</p>';
    }
    function mountEntry(game, platform, tid, e, idx) {
      var id = 'bstory-' + idx;
      A.widgets.mountStory({ id: id, gameName: game, previewLead: 0.2,
        timeline: function () { if (!e.hasWindows) throw new Error('no measured title windows (list-only row)'); return A.Story.bufferTimeline(A.D, A.BD, game, platform, e); },
        program: function () {
          var tl = A.Story.bufferTimeline(A.D, A.BD, game, platform, e), corr = Number(p('correctionMs', 0)) || 0;
          var cues = cueProgram(A.G1, tl, corr, Number(p('beeps', A.D.gen1.defaults.count_in_beeps)) || 0, A.D.gen1.defaults.count_in_spacing_s);
          return { cues: cues, visuals: A.Cue.visualsFor(cues), endT: tl.tMax + 0.3, label: game + '/' + platform + ' buffer: ' + e.seq,
            clock: function (t) { var nx = null; for (var i = 0; i < cues.length; i++) if (cues[i].t > t) { nx = cues[i]; break; } return nx ? nx.label + ' in ' + (nx.t - t).toFixed(1) + ' s' : (tl.roll && t < tl.roll.t + 0.5 ? 'rolling' : 'done'); } };
        } });
    }
    function resultsHtml(game, platform) {
      var mode = p('targetMode', 'tid');
      if (mode === 'tid') {
        var text = String(p('tid', '')).trim();
        if (!text) return '<p class="muted">Type the Trainer ID you want (decimal 16589 or $40CD).</p>';
        var tid;
        try { tid = A.G1.parseTid(text); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
        var l;
        try { l = lookup(A.D, A.BD, game, platform, tid); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
        if (!l) return '<p class="warn">' + esc(A.fmtTid(tid)) + ' has no sequence in the ' + esc(game) + '/' + esc(platform) + ' table (' + A.D.buffer.games[game][platform].tids + ' of 65536 Trainer IDs have one).</p>';
        // a b / l row is a published community row; only an all-h result is ours alone
        return '<p>' + esc(A.fmtTid(tid)) + ': ' + l.entries.length + ' sequence' + (l.entries.length === 1 ? '' : 's') + ' in the data (fastest first; a reset-free route comes first only when it is also the fastest).</p>' +
          A.sourcesHtml(game, tid, l.entries.some(function (e) { return e.v !== 'h'; }) ? 'community' : 'derived') +
          l.entries.map(function (e, i) { return entryHtml(game, platform, tid, e, i); }).join('') +
          gotHtml(game, platform, tid, l);
      }
      var sets = setsFor(A.D, game), key = p('set', sets.length ? sets[0].key : '');
      if (!sets.some(function (s) { return s.key === key; })) key = sets.length ? sets[0].key : '';
      if (!key) return '<p class="muted">No target set is defined for ' + esc(game) + ' in gen1-buffer.json.</p>';
      var r;
      try { r = setSearch(A.D, A.BD, game, platform, key, 20); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      var h = '<p><b>' + esc(r.set.name) + '</b>: ' + r.set.tids.length + ' member' + (r.set.tids.length === 1 ? '' : 's') + ', ' + r.covered + ' with a sequence in the ' + esc(game) + '/' + esc(platform) + ' table' + (r.rows.length ? '. The ' + r.rows.length + ' simplest:' : ': this table reaches none of them.') + '</p>';
      if (r.set.route) h += '<p class="small muted">' + esc(r.set.route) + '</p>';
      h += '<table class="tbl"><tr><th>TID</th><th>sequence</th><th>tokens</th><th>s</th><th>v</th><th></th></tr>' + r.rows.map(function (row) {
        return '<tr><td class="mono">' + esc(A.fmtTid(row.tid)) + '</td><td class="mono small">' + esc(row.entry.seq) + '</td><td>' + row.entry.tokens.length + '</td><td>' + row.entry.seconds.toFixed(2) + '</td><td><span class="tag ' + (row.entry.v === 'b' ? 'ok' : row.entry.v === 'l' ? 'warn' : '') + '" title="' + esc(row.entry.verification) + '">' + esc(row.entry.v) + '</span></td><td><button type="button" class="secondary small" data-buffer-use="' + row.tid + '">steps</button></td></tr>';
      }).join('') + '</table>';
      h += '<p class="small muted">v: ' + ['b', 'h', 'l'].map(function (v) { return v + ' = ' + esc(verificationText(A.D, v)); }).join('; ') + '.</p>';
      return h;
    }
    // "What did you get?" - see diagnose(). No correction is fitted and none is offered: what comes back is the
    // routes that produce the Trainer ID that actually came out, and the earliest step at which the nearest of
    // them differs from the one being run.
    function gotHtml(game, platform, aimTid, l) {
      var ranIdx = Math.min(Number(p('ranIdx', 0)) || 0, l.entries.length - 1);
      var text = String(p('got', '')).trim();
      var h = '<div class="calib"><h3>What did you get?</h3>' +
        '<p class="small muted">Type the Trainer ID the attempt actually produced (the Trainer Card, or a Pokemon\'s status screen shows IDNo). There is no correction to tune on a buffer route - it is a list of presses, not a timing offset - so what this does instead is find the routes that produce what you got and show where the nearest one parts company with yours.</p>';
      if (l.entries.length > 1) h += A.select('buffer-ran', l.entries.map(function (e, i) { return { id: String(i), title: 'Sequence ' + (i + 1) + ': ' + e.seq }; }), String(ranIdx), 'Which sequence were you running?');
      h += '<div class="row"><label class="field">Trainer ID you got<input type="text" id="buffer-got" value="' + esc(text) + '" placeholder="16589 or $40CD"></label></div>';
      if (!text) return h + '</div>';
      var got;
      try { got = A.G1.parseTid(text); } catch (e) { return h + '<p class="bad">' + esc(A.errMsg(e)) + '</p></div>'; }
      var ranSeq = l.entries[ranIdx].seq, d;
      try { d = diagnose(A.D, A.BD, game, platform, ranSeq, got); } catch (e) { return h + '<p class="bad">' + esc(A.errMsg(e)) + '</p></div>'; }
      if (got === aimTid) return h + '<p class="good">' + esc(A.fmtTid(got)) + ' is the one you were aiming at. Nothing to diagnose.</p></div>';
      if (!d.known) return h + '<p class="warn">' + esc(A.fmtTid(got)) + ' has no sequence in the ' + esc(game) + '/' + esc(platform) + ' table, so nothing can be inferred from it. That usually means an input landed outside every window the grammar knows - a press in a polling stretch, or a button held across a scene boundary - rather than one step going to a different member of its family.</p></div>';
      var n = d.nearest;
      h += '<p>' + esc(A.fmtTid(got)) + ' is produced by ' + d.entries.length + ' sequence' + (d.entries.length === 1 ? '' : 's') + ' in this table.</p>';
      if (n.ranToken == null && n.gotToken == null) h += '<p class="warn">One of them is the sequence you were running, so the same route can give both Trainer IDs: this table does not separate them, and the attempt tells you nothing about your execution.</p>';
      else h += '<p>The nearest of them agrees with your route for its first ' + n.shared + ' step' + (n.shared === 1 ? '' : 's') + ' and then differs: <b>step ' + (n.shared + 1) + '</b>, where you were asked for <span class="mono">' + esc(n.ranToken == null ? '(nothing further)' : n.ranToken) + '</span> and that route has <span class="mono">' + esc(n.gotToken == null ? '(nothing further)' : n.gotToken) + '</span>.</p>' +
        '<p class="small muted">Consistent with step ' + (n.shared + 1) + ' going wrong - not proof of it. Several different mistakes can land on the same Trainer ID, and the table only knows routes the grammar can express.</p>' +
        '<p class="mono small">' + esc(n.seq) + '</p>';
      return h + '</div>';
    }
    function statusHtml(game, platform) {
      var bf = A.D.buffer, gp = bf.games[game][platform], plat = bf.platforms[platform];
      return A.statusBlock([
        ['Table', game + '/' + platform + ' of gen1-buffer.json (generated ' + bf.generated + '; source rows: ' + gp.source + ')'],
        ['Platform', plat.name],
        ['Platform status', plat.status],
        ['Rows', 'verified ' + gp.verified_rows + ', checked ' + gp.checked_rows + ', harness ' + gp.harness_rows + ', list ' + gp.list_rows + '; ' + gp.tids + ' Trainer IDs with up to ' + gp.per_tid + ' sequence(s) each'],
        ['Harness', bf.harness.core + ' ' + bf.harness.commit + ' (harness sha1 ' + bf.harness.harness_sha1 + ')'],
        ['Source', bf.source],
        ['Validity', A.VALID_ONLY + ' The methodology here is the buffer grammar: every step above is one of its tokens with the data\'s own window.'],
        ['Frames', bf.frame_convention]
      ]);
    }
    function render(el, game) {
      var platform = platformKey(game), plats = platformsFor(A.D, game), sets = setsFor(A.D, game), mode = p('targetMode', 'tid');
      var h = '<h2>Buffer guide: ' + esc(A.D.gen1.games[game].name) + '</h2>';
      h += A.card('<h3>1. Platform</h3>' + A.choices('platform', plats.map(function (pk) { var pl = A.D.buffer.platforms[pk]; return { id: pk, title: pl.name, sub: pl.status }; }), platform));
      h += A.card('<h3>2. Target</h3><div class="tabs">' +
        '<button type="button" class="tab' + (mode === 'tid' ? ' active' : '') + '" data-buffer-mode="tid">Trainer ID</button>' +
        '<button type="button" class="tab' + (mode === 'set' ? ' active' : '') + '" data-buffer-mode="set">Target set</button></div>' +
        (mode === 'tid' ? '<label class="field">Trainer ID (decimal or $hex)<input type="text" id="buffer-tid" value="' + esc(p('tid', '')) + '" placeholder="16589 or $40CD"></label>' :
          A.select('buffer-set', sets.map(function (s) { return { id: s.key, title: s.name + ' (' + s.tids.length + ')' }; }), p('set', sets.length ? sets[0].key : ''), 'Target set')) +
        '<label class="field">Correction (ms): every beep this much earlier, for your reaction and the audio delay<input type="number" step="10" id="buffer-corr" value="' + esc(p('correctionMs', 0)) + '"></label>' +
        A.signButtonHtml('buffer-corr') +
        '<label class="field">Count-in beeps before the first step<input type="number" min="0" max="9" id="buffer-beeps" value="' + esc(p('beeps', A.D.gen1.defaults.count_in_beeps)) + '"></label>' +
        A.toolsHtml(['flowtimer'], 'The storyboard cues below mark each buffered window; the community runs these routes with FlowTimer, whose offsets the videos quote:'));
      h += '<div id="buffer-results">' + resultsHtml(game, platform) + '</div>';
      h += A.sourcesCard(game);
      h += A.card('<h3>Status (from the data)</h3>' + statusHtml(game, platform));
      el.innerHTML = h;
      mountAll(game, platform);
    }
    function mountAll(game, platform) {
      if (p('targetMode', 'tid') !== 'tid') return;
      var text = String(p('tid', '')).trim(); if (!text) return;
      var tid; try { tid = A.G1.parseTid(text); } catch (e) { return; }
      var l = lookup(A.D, A.BD, game, platform, tid); if (!l) return;
      l.entries.forEach(function (e, i) { mountEntry(game, platform, tid, e, i); });
    }
    function update(game) {
      var platform = platformKey(game), el = A.$('buffer-results');
      if (el) { A.widgets.stopAll(); el.innerHTML = resultsHtml(game, platform); mountAll(game, platform); }
    }
    function onEvent(ev, game) {
      var t = ev.target;
      if (ev.type === 'click') {
        var c = t.closest('[data-choice="platform"]'); if (c) { A.setPref('buffer', { platform: c.getAttribute('data-id') }); return 'render'; }
        var m = t.closest('[data-buffer-mode]'); if (m) { A.setPref('buffer', { targetMode: m.getAttribute('data-buffer-mode') }); return 'render'; }
        var u = t.closest('[data-buffer-use]'); if (u) { A.setPref('buffer', { targetMode: 'tid', tid: u.getAttribute('data-buffer-use') }); return 'render'; }
      } else {
        if (t.id === 'buffer-tid') { A.setPref('buffer', { tid: t.value }); update(game); }
        else if (t.id === 'buffer-set') { A.setPref('buffer', { set: t.value }); update(game); }
        else if (t.id === 'buffer-corr') { A.setPref('buffer', { correctionMs: Number(t.value) || 0 }); return 'render'; }
        else if (t.id === 'buffer-beeps') { A.setPref('buffer', { beeps: Number(t.value) || 0 }); return 'render'; }
        else if (t.id === 'buffer-got') { A.setPref('buffer', { got: t.value }); update(game); }
        else if (t.id === 'buffer-ran') { A.setPref('buffer', { ranIdx: Number(t.value) || 0 }); update(game); }
      }
      return null;
    }
    A.registerMode({ id: 'gen1-buffer', title: 'Buffer guide', games: ['red', 'yellow'], render: render, onEvent: onEvent,
      line: function (game) { var pk = platformKey(game); return A.D.buffer.platforms[pk].status; },
      sub: function () { return 'buffered inputs from power-on (community list + harness)'; } });
  }
  return pure;
});
