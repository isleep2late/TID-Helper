// TID Helper page: Pokemon Crystal on a Game Boy Player, the multi-step "prescribed sequence" methodology
// (gen2-psr.json, crystal/gbp/psr-v1). This is a SECOND methodology beside page-gen2.js's hold-START single tap,
// not a replacement: its degenerate case IS that single tap, and the data generator asserts the two agree on all
// 599 overlapping bins before it will write the file.
// What it adds: buffered backouts of the main menu and a measured wait let the script reach Trainer IDs one tap
// cannot, and the NEW GAME A press is HELD OUT until the roll instead of tapped for 4-8 frames - so 98.79% of all
// 65,536 Trainer IDs have a route here, against 1.81% for the single-tap table on Crystal.
// The table is an inverse one: Trainer ID -> the easiest script that produces it. UMD: the pure part runs under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperGen2Psr = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  var DEFAULT_GAME = 'crystal', PLATFORM = 'gbp';
  // which games the shipped data actually has a table for; the browser reads it at load, node falls back
  function derivedGames() {
    var d = root.TID_HELPER_DATA, g = d && d.gen2psr && d.gen2psr.games;
    return g ? Object.keys(g) : ['crystal', 'gold', 'silver'];
  }

  function meth(D, game, platform) {
    var g = D.gen2psr && D.gen2psr.games && D.gen2psr.games[game || DEFAULT_GAME];
    var m = g && g[platform || PLATFORM];
    if (!m) fail('gen2-psr.json has no ' + (game || DEFAULT_GAME) + '/' + (platform || PLATFORM));
    return m;
  }
  // base64 -> byte array, in the browser and under node
  function bytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  // the decoded tables are big; decode once per methodology object and keep them on it
  // Gold and Silver select a table by the cartridge clock's day bracket. The top-level table is days0
  // (fresh clock); rtc_tables holds the others. Crystal is RTC-immune and has none. A runner who resets
  // repeatedly is only ever in days0 or days512, so reading the wrong one silently gives another
  // state's Trainer ID - which is why the state is a visible choice and not a default.
  function rtcStates(m) { return ['days0'].concat(m.rtc_tables ? Object.keys(m.rtc_tables) : []); }
  function tableSource(m, state) {
    if (!state || state === 'days0') return m;
    var rt = m.rtc_tables && m.rtc_tables[state];
    if (!rt) fail('gen2-psr.json ' + m.id + ' has no table for cartridge-clock state ' + state);
    return rt;
  }
  function tables(m, state) {
    if (state && state !== 'days0') {
      var src = tableSource(m, state);
      if (!src.__tables) {
        var tt = { code: bytes(src.script_code_b64), lid: bytes(src.lid_b64), bm: bytes(src.covered_bitmap_b64), sid: null };
        if (tt.code.length !== 65536 * 3 || tt.lid.length !== 65536 * 2 || tt.bm.length !== 8192)
          fail('gen2-psr.json ' + m.id + ' ' + state + ' tables are the wrong size');
        Object.defineProperty(src, '__tables', { value: tt, enumerable: false });
      }
      return src.__tables;
    }
    if (!m.__tables) {
      // sid_b64 is absent for games with no Secret ID (Gold, Silver): shipping 128 KB of zeros for them
      // would be pure weight in an offline bundle. Absent means every Secret ID reads 0.
      var t = { code: bytes(m.script_code_b64), lid: bytes(m.lid_b64), bm: bytes(m.covered_bitmap_b64),
                sid: m.sid_b64 ? bytes(m.sid_b64) : null };
      if (t.code.length !== 65536 * 3 || t.lid.length !== 65536 * 2 || t.bm.length !== 8192 || (t.sid && t.sid.length !== 65536 * 2))
        fail('gen2-psr.json tables are the wrong size (code ' + t.code.length + ', lid ' + t.lid.length + ', sid ' + (t.sid ? t.sid.length : 'absent') + ', bitmap ' + t.bm.length + ')');
      if (!t.sid && m.rolls.indexOf('sid') !== -1) fail('gen2-psr.json ' + m.id + ' says it rolls a Secret ID but ships no sid table');
      Object.defineProperty(m, '__tables', { value: t, enumerable: false });
    }
    return m.__tables;
  }
  function covered(m, tid, state) { var t = tables(m, state); return ((t.bm[tid >> 3] >> (tid & 7)) & 1) === 1; }
  // Alternate routes reach the SAME Trainer ID with a DIFFERENT Lucky ID, so a specific (TID, LID) pair
  // can be asked for. alt_count_b64 is one byte of count per Trainer ID; alt_stream_b64 is a flat run of
  // 5-byte (LID, script code) records in the same order. Offsets are a prefix sum, computed once.
  function altTables(m) {
    if (!m.__alt) {
      var a = null;
      if (m.alt_count_b64 && m.alt_stream_b64) {
        var cnt = bytes(m.alt_count_b64), st = bytes(m.alt_stream_b64);
        if (cnt.length !== 65536) fail('gen2-psr.json ' + m.id + ' alt_count_b64 is ' + cnt.length + ' bytes, not 65536');
        var off = new Uint32Array(65537), acc = 0, i;
        for (i = 0; i < 65536; i++) { off[i] = acc; acc += cnt[i]; }
        off[65536] = acc;
        if (st.length !== acc * 5) fail('gen2-psr.json ' + m.id + ' alt_stream_b64 is ' + st.length + ' bytes, not ' + acc * 5);
        a = { cnt: cnt, st: st, off: off, pairs: acc };
      }
      Object.defineProperty(m, '__alt', { value: a, enumerable: false });
    }
    return m.__alt;
  }
  function decodeCode(v, m) {
    var pi = (v >> 16) & 0x0F, pre = (v >> 14) & 3, opt = (v >> 13) & 1, post = (v >> 11) & 3, W = (v & 0x7FF) * 4;
    var pl = m.plateaus[pi];
    if (!pl) fail('gen2-psr.json: a route names plateau ' + pi + ', which the data does not define');
    return { plateau: pl, plateauIndex: pi, pre: pre, opt: opt === 1, post: post, waitFrames: W, methodology: m };
  }
  // every Lucky ID reachable for this Trainer ID, easiest route first, primary first
  function lidsFor(D, tid, game, platform) {
    var m = meth(D, game, platform);
    if (!covered(m, tid)) return [];
    var t = tables(m), out = [{ lid: (t.lid[2 * tid] << 8) | t.lid[2 * tid + 1], primary: true }];
    var a = altTables(m);
    if (a) for (var k = a.off[tid]; k < a.off[tid + 1]; k++) {
      var b = k * 5;
      out.push({ lid: (a.st[b] << 8) | a.st[b + 1], primary: false, code: (a.st[b + 2] << 16) | (a.st[b + 3] << 8) | a.st[b + 4] });
    }
    return out;
  }
  // a route for an exact (Trainer ID, Lucky ID) pair, or null
  function routeForPair(D, tid, lid, game, platform) {
    var m = meth(D, game, platform);
    var primary = routeFor(D, tid, game, platform);
    if (!primary) return null;
    if (primary.lid === lid) return primary;
    var a = altTables(m);
    if (!a) return null;
    for (var k = a.off[tid]; k < a.off[tid + 1]; k++) {
      var b = k * 5;
      if (((a.st[b] << 8) | a.st[b + 1]) === lid) {
        var r = decodeCode((a.st[b + 2] << 16) | (a.st[b + 3] << 8) | a.st[b + 4], m);
        r.tid = tid; r.lid = lid; r.sid = primary.sid;
        return r;
      }
    }
    return null;
  }
  // Trainer ID -> the stored script, or null when the sweep never produced that ID
  function routeFor(D, tid, game, platform, state) {
    if (!(Number.isInteger(tid) && tid >= 0 && tid <= 0xFFFF)) fail('Trainer ID must be 0..65535');
    var m = meth(D, game, platform), t = tables(m, state);
    if (!covered(m, tid, state)) return null;
    var v = (t.code[3 * tid] << 16) | (t.code[3 * tid + 1] << 8) | t.code[3 * tid + 2];
    var pi = (v >> 16) & 0x0F, pre = (v >> 14) & 3, opt = (v >> 13) & 1, post = (v >> 11) & 3, W = (v & 0x7FF) * 4;
    var pl = m.plateaus[pi];
    if (!pl) fail('gen2-psr.json: Trainer ID ' + tid + ' names plateau ' + pi + ', which the data does not define');
    return { tid: tid, rtcState: state || 'days0', lid: (t.lid[2 * tid] << 8) | t.lid[2 * tid + 1],
             sid: t.sid ? (t.sid[2 * tid] << 8) | t.sid[2 * tid + 1] : 0,
             plateau: pl, plateauIndex: pi, pre: pre, opt: opt === 1, post: post, waitFrames: W, methodology: m };
  }
  function fps(D) {
    var e = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(D.gen2psr.fps_expression));
    if (!e) fail('gen2-psr.json fps_expression is not a/b');
    return Number(e[1]) / Number(e[2]);
  }
  // The script a person performs, in order. Every line below is checked against gen2tid.cpp's psr mode:
  // backout() holds B for backout_b_frames then switches to START (it does NOT wait for the title screen -
  // the title is not even visible by then); the wait is counted from the menu DETECTOR, which the data says
  // is visible_menu_lag_frames earlier than the box a person can see; the OPTION step presses A a fixed
  // number of frames after DOWN. Getting any of these wrong hands the runner a different Trainer ID with no
  // way to notice, so this function and that C++ must be read together.
  var VISIBLE_MENU_LAG = 4;
  function scriptLines(D, r) {
    var f = fps(D), pl = r.plateau, m = r.methodology, out = [];
    var bF = m.backout_b_frames, bTol = m.backout_b_tolerance || [], oF = m.option_down_to_a_frames;
    out.push('Clear the save data: hold Up + B + Select on the title screen, so the menu shows NEW GAME with no CONTINUE. '
      + 'Then turn the console OFF - every frame count below is measured from power-on, so the attempt has to start from one.');
    out.push(pl.hold_lo_frame === 0
      ? 'Hold START from the moment you power on and keep holding it until the main menu appears. Any time in the first '
        + pl.hold_hi_frame + ' frames (' + (pl.hold_hi_frame / f).toFixed(2) + ' s) works, so there is nothing to time here.'
      : 'Press START between frame ' + pl.hold_lo_frame + ' and frame ' + pl.hold_hi_frame + ' after power-on ('
        + (pl.hold_lo_frame / f).toFixed(2) + '-' + (pl.hold_hi_frame / f).toFixed(2) + ' s, a window of '
        + pl.width_frames + ' frames) and hold it until the main menu appears.');
    var backout = function (label) {
      return label + ': press B, then about ' + bF + ' frames later (' + (bF / f).toFixed(2) + ' s) press START and hold it '
        + 'until the menu comes back.' + (bTol.length === 2 ? ' Anywhere from ' + bTol[0] + ' to ' + bTol[1] + ' frames after the menu works.' : '')
        + ' Do NOT wait for the title screen to finish appearing before pressing START - by then you are already too late '
        + 'and the Trainer ID will be a different one.';
    };
    for (var i = 0; i < r.pre; i++) out.push(backout('Back out and return (' + (i + 1) + ' of ' + r.pre + ')'));
    // the route's W is measured from the detector; a person can only see the box, VISIBLE_MENU_LAG frames later
    var fromBox = r.waitFrames - VISIBLE_MENU_LAG;
    out.push(r.waitFrames === 0
      ? 'Do not wait: go straight on.'
      : fromBox <= 0
        ? 'Wait ' + r.waitFrames + ' frames from the menu, doing nothing. NOTE: this route is measured from a point '
          + VISIBLE_MENU_LAG + ' frames BEFORE the menu box is drawn, so it cannot be timed off the box you can see. '
          + 'Pick a different Trainer ID unless you can count from the frame the menu data loads.'
        : 'Wait ' + fromBox + ' frames (' + (fromBox / f).toFixed(2) + ' s) from the moment the menu box appears, doing nothing. '
          + '(The route is stored as ' + r.waitFrames + ' frames from the menu data loading, which is ' + VISIBLE_MENU_LAG
          + ' frames before the box is drawn.) This has to land inside a ' + m.poll_period_frames + '-frame window ('
          + (m.poll_period_frames / f * 1000).toFixed(0) + ' ms).');
    if (r.opt) out.push('Press DOWN, then press A ' + oF + ' frames later (' + (oF / f).toFixed(2) + ' s) to enter OPTION, '
      + 'then hold START until the main menu reloads. The gap between DOWN and A is timed: a few frames out and the Trainer ID changes.');
    for (var j = 0; j < r.post; j++) out.push(backout('Back out and return again (' + (j + 1) + ' of ' + r.post + ')'));
    out.push('Press A on NEW GAME and HOLD IT DOWN. Do not release it until the game has started - holding it out is what makes '
      + 'this press forgiving, and releasing early is the usual way to miss.');
    return out;
  }
  function coverage(D, game, platform) { var m = meth(D, game, platform); return m.coverage; }
  var pure = { meth: meth, routeFor: routeFor, routeForPair: routeForPair, lidsFor: lidsFor, altTables: altTables,
               scriptLines: scriptLines, coverage: coverage, covered: covered, tables: tables, fps: fps,
               rtcStates: rtcStates, tableSource: tableSource };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'gen2psr';
    // A.pref is keyed by SECTION only, and this mode serves three games, so key the typed ID by game
    function p(k, game, d) { var v = A.pref(SEC, k + '.' + game); return v === undefined ? d : v; }
    function parseTid(str) {
      str = String(str == null ? '' : str).trim();
      if (!str) return null;
      var m = /^\$?([0-9A-Fa-f]{1,4})$/.exec(str), n;
      if (str.charAt(0) === '$' || (m && /[A-Fa-f]/.test(str))) n = m ? parseInt(m[1], 16) : NaN;
      else n = /^\d{1,5}$/.test(str) ? Number(str) : NaN;
      return Number.isInteger(n) && n >= 0 && n <= 0xFFFF ? n : NaN;
    }
    // never substring-test `predicts`: the Gold/Silver value CONTAINS 'Secret ID' inside the phrase that
    // denies there is one. Use the structural list the builder writes.
    function rollsSid(m) { return Array.isArray(m.rolls) && m.rolls.indexOf('sid') !== -1; }
    function stateOf(game) {
      var m; try { m = meth(A.D, game); } catch (e) { return 'days0'; }
      var want = p('rtc', game, 'days0');
      return rtcStates(m).indexOf(want) === -1 ? 'days0' : want;
    }
    function resultHtml(game) {
      var D = A.D, tid = parseTid(p('tid', game, '')), st = stateOf(game);
      if (tid === null) return '<p class="muted">Type a Trainer ID to get its script.</p>';
      if (!Number.isInteger(tid)) return '<p class="muted">That is not a Trainer ID: give a number 0-65535, or hex like $6F49.</p>';
      var m, r, lidWanted = parseTid(p('lid', game, ''));
      try {
        m = meth(D, game);
        r = Number.isInteger(lidWanted) ? routeForPair(D, tid, lidWanted, game) : routeFor(D, tid, game, PLATFORM, st);
      } catch (e) { return '<p class="muted">' + esc(A.errMsg ? A.errMsg(e) : String(e.message || e)) + '</p>'; }
      // a Lucky ID was asked for and this Trainer ID cannot reach it: say which ones it can
      if (Number.isInteger(lidWanted) && !r && covered(m, tid, st)) {
        var avail = lidsFor(D, tid, game);
        return '<p>' + esc(A.fmtTid(tid)) + ' cannot be paired with Lucky ID ' + esc(A.fmtTid(lidWanted))
          + ' by any script in this sweep.</p><p class="small">It reaches ' + avail.length + ' Lucky ID'
          + (avail.length === 1 ? '' : 's') + ': ' + avail.slice(0, 24).map(function (x) { return esc(A.fmtTid(x.lid)); }).join(', ')
          + (avail.length > 24 ? ', and more' : '') + '.</p>';
      }
      if (!r) {
        var cv = tableSource(m, st).coverage;
        return '<p>' + esc(A.fmtTid(tid)) + ' is one of the ' + (65536 - cv.tids_covered)
          + ' Trainer IDs (' + (100 - cv.percent).toFixed(2) + '%) this sweep never produced'
          + (st !== 'days0' ? ' in cartridge-clock state ' + esc(st) : '') + '. '
          + 'Try the timed tap method for it, or pick another ID.</p>';
      }
      var extra = r.pre + (r.opt ? 1 : 0) + r.post;
      return '<p><b>' + esc(A.fmtTid(tid)) + '</b> - Lucky ID ' + esc(A.fmtTid(r.lid))
        + (rollsSid(m) ? ', Secret ID ' + esc(A.fmtTid(r.sid)) : '')
        + (rtcStates(m).length > 1 ? ' <span class="muted">(cartridge clock: ' + esc(r.rtcState) + ')</span>' : '') + '.</p>'
        + '<p class="small muted">Hold window ' + r.plateau.width_frames + ' frames'
        + (extra === 0 ? ', no backouts' : ', ' + (r.pre + r.post) + ' backout' + (r.pre + r.post === 1 ? '' : 's') + (r.opt ? ' and an OPTION step' : ''))
        + ', wait ' + r.waitFrames + ' frames.</p>'
        + '<ol class="plain">' + scriptLines(D, r).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
    }
    function render(el, game) {
      var D = A.D, m, c;
      try { m = meth(D, game); } catch (e) {
        el.innerHTML = A.card('<h3>Not derived for this game</h3><p class="small">' + esc(A.errMsg ? A.errMsg(e) : String(e.message || e)) + '</p>');
        return;
      }
      c = m.coverage;
      var h = '<h2>' + esc(m.name) + '</h2>';
      h += A.card('<h3>What this is</h3>'
        + '<p class="small">' + esc(D.gen2psr.what_this_is) + '</p>'
        + '<p class="small"><b>Coverage.</b> ' + c.tids_covered.toLocaleString() + ' of 65,536 Trainer IDs (' + c.percent
        + '%) have a script here, from ' + c.boots.toLocaleString() + ' emulator boots.</p>'
        + (m.rtc_note ? '<p class="small muted"><b>Cartridge clock.</b> ' + esc(m.rtc_note) + '</p>' : '')
        + '<p class="small muted">' + esc(m.console_name) + ' only. ' + esc(D.gen2psr.not_derived[0]) + '</p>');
      h += A.card('<h3>Buffered presses</h3><p class="small">' + esc(D.gen2psr.buffering) + '</p>'
        + '<p class="small">Only two things are timed: ' + D.gen2psr.timed_elements.map(esc).join('; and ') + '.</p>');
      if (rtcStates(m).length > 1) {
        var st0 = stateOf(game);
        h += A.card('<h3>Cartridge clock</h3>'
          + A.choices('g2psr-rtc', rtcStates(m).map(function (k) {
              var src = tableSource(m, k);
              return { id: k, title: k === 'days0' ? 'Fresh clock (days0)' : (src.label || k),
                       sub: src.coverage.tids_covered.toLocaleString() + ' Trainer IDs (' + src.coverage.percent + '%)' };
            }), st0)
          + '<p class="small muted">' + esc(m.rtc_tables_note || '') + ' Reading the wrong one gives a different Trainer ID with no warning, which is why it is asked rather than assumed.</p>');
      }
      h += A.card('<h3>Trainer ID</h3>'
        + '<div class="row"><label class="field">Trainer ID<input type="text" id="g2psr-tid" value="' + esc(p('tid', game, '')) + '" placeholder="28489 or $6F49"></label>'
        + (altTables(m) ? '<label class="field">Lucky ID (optional)<input type="text" id="g2psr-lid" value="' + esc(p('lid', game, '')) + '" placeholder="any"></label>' : '') + '</div>'
        + (altTables(m)
            ? '<p class="small muted">Leave the Lucky ID blank for the easiest route to that Trainer ID. Fill it in to ask for an exact pair: '
              + altTables(m).pairs.toLocaleString() + ' alternate routes are stored, so '
              + (altTables(m).pairs + m.coverage.tids_covered).toLocaleString() + ' (Trainer ID, Lucky ID) pairs can be asked for.</p>'
            : '<p class="small muted">' + esc(m.alt_note) + '</p>')
        + '<div id="g2psr-result">' + resultHtml(game) + '</div>');
      h += A.card('<h3>Credit</h3>'
        + '<ul class="plain small">' + D.gen2psr.credits.map(function (cr) {
            return '<li><b>' + esc(cr.who) + '</b> - ' + esc(cr.role) + '.<br>' + esc(cr.what)
              + (cr.url ? ' <a href="' + esc(cr.url) + '" target="_blank" rel="noopener noreferrer">' + esc(cr.url) + '</a>' : '')
              + (cr.where ? ' <span class="muted">(' + esc(cr.where) + ')</span>' : '') + '</li>';
          }).join('') + '</ul>'
        + '<p class="small muted">' + esc(D.gen2psr.credit_note) + '</p>');
      h += A.card('<h3>Status (from the data)</h3>' + A.statusBlock([
        ['Methodology', m.id + ': ' + m.name], ['Status', m.status], ['Validation', m.validation],
        ['ROM', m.rom_sha1 ? 'sha1 ' + m.rom_sha1 : null], ['Boot ROM', 'sha1 ' + m.bios_sha1],
        ['RTC state', m.rtc_state], ['Longest wait swept', m.wait_max_frames + ' frames'],
        ['Route ranking', m.route_ranking], ['Frames', D.gen2psr.frame_convention], ['Source', D.gen2psr.source]])
        + A.details('What has NOT been derived (' + D.gen2psr.not_derived.length + ')',
            '<ul class="plain small">' + D.gen2psr.not_derived.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>')
        + A.details('Citations', '<ul class="plain small">' + D.gen2psr.citations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'));
      el.innerHTML = h;
    }
    function onEvent(ev, game) {
      if (ev.type === 'click' && ev.target) {
        var c = ev.target.closest('[data-choice="g2psr-rtc"]');
        if (c) { var o2 = {}; o2['rtc.' + game] = c.getAttribute('data-id'); A.setPref(SEC, o2); return 'render'; }
      }
      if (ev.type !== 'click' && ev.target && (ev.target.id === 'g2psr-tid' || ev.target.id === 'g2psr-lid')) {
        var o = {}; o[(ev.target.id === 'g2psr-lid' ? 'lid.' : 'tid.') + game] = ev.target.value; A.setPref(SEC, o);
        var r = A.$('g2psr-result');
        if (r) r.innerHTML = resultHtml(game);   // never 'render': it would eat focus on every keystroke
      }
      return null;
    }
    A.registerMode({ id: 'gen2-psr', title: 'Prescribed sequence', games: derivedGames(), render: render, onEvent: onEvent,
      line: function (game) { try { return meth(A.D, game).status; } catch (e) { return 'not derived for this game'; } },
      sub: function (game) { try { return meth(A.D, game).id; } catch (e) { return null; } } });
  }
  return pure;
});
