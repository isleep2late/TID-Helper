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
      var held = tok === 'hop0' && ti > 0 && toks[ti - 1] === 'gfskip';
      var means = held
        ? 'Do not press anything new: keep Up+Select+B held from the Game Freak skip straight into the scene. It registers on the walk-in poll by itself.'
        : b.means;
      out.push({ n: out.length + 1, token: tok, kind: pal[tok] ? 'boot' : (isResetToken(tok) ? 'reset' : (held || tok === 'hop6' || tok === 'gfwait' ? 'hold' : 'press')), grammarKey: k.base, means: means, window: b.window, citation: b.citation,
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
  // the cue program for a composed timeline: a mark tone at every press window's opening (named by the token), the A tone at
  // NEW GAME's window, a mark at the roll; correctionMs shifts every cue earlier (the runner's reaction to the logo)
  function cueProgram(G1, tl, correctionMs) {
    var cues = [], corr = (correctionMs || 0) / 1000;
    tl.inputs.forEach(function (b) {
      if (b.kind === 'window') {
        var ng = b.text === 'newgame';
        cues.push({ t: b.t0 - corr, freq: ng ? G1.A_CUE_TONE[0] : G1.MENU_MARK_TONE[0], ms: ng ? G1.A_CUE_TONE[1] : G1.MENU_MARK_TONE[1], label: ng ? 'A' : b.text, kind: ng ? 'A' : 'mark' });
      }
    });
    if (tl.roll) cues.push({ t: tl.roll.t - corr, freq: G1.MENU_MARK_TONE[0], ms: G1.MENU_MARK_TONE[1], label: 'rolled', kind: 'mark' });
    cues.sort(function (a, b) { return a.t - b.t; });
    return cues;
  }

  var pure = { platformsFor: platformsFor, verificationText: verificationText, grammarKeys: grammarKeys, steps: steps, lookup: lookup, setsFor: setsFor, expandSet: expandSet, setSearch: setSearch, encodableTokens: encodableTokens, cueProgram: cueProgram, isResetToken: isResetToken, table: table };

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
        A.widgets.storyWidgetHtml(id, 'the Nintendo logo', reason));
    }
    function sText(D) { var m = /s = ([^|]*)\|/.exec(D.buffer.encoding.entry); return m ? m[1].trim() : 'centiseconds'; }
    function mountEntry(game, platform, tid, e, idx) {
      var id = 'bstory-' + idx;
      A.widgets.mountStory({ id: id, gameName: game, previewLead: 0.2,
        timeline: function () { if (!e.hasWindows) throw new Error('no measured title windows (list-only row)'); return A.Story.bufferTimeline(A.D, A.BD, game, platform, e); },
        program: function () {
          var tl = A.Story.bufferTimeline(A.D, A.BD, game, platform, e), corr = Number(p('correctionMs', 0)) || 0;
          var cues = cueProgram(A.G1, tl, corr);
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
          l.entries.map(function (e, i) { return entryHtml(game, platform, tid, e, i); }).join('');
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
        '<label class="field">Correction (ms): every beep this much earlier, for your reaction to the logo<input type="number" step="10" id="buffer-corr" value="' + esc(p('correctionMs', 0)) + '"></label>' +
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
        else if (t.id === 'buffer-corr') A.setPref('buffer', { correctionMs: Number(t.value) || 0 });
      }
      return null;
    }
    A.registerMode({ id: 'gen1-buffer', title: 'Buffer guide', games: ['red', 'yellow'], render: render, onEvent: onEvent,
      line: function (game) { var pk = platformKey(game); return A.D.buffer.platforms[pk].status; },
      sub: function () { return 'buffered inputs from power-on (community list + harness)'; } });
  }
  return pure;
});
