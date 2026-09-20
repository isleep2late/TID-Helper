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
    if (primary.lid === lid) { primary.fromAlternate = false; return primary; }
    var a = altTables(m);
    if (!a) return null;
    for (var k = a.off[tid]; k < a.off[tid + 1]; k++) {
      var b = k * 5;
      if (((a.st[b] << 8) | a.st[b + 1]) === lid) {
        var r = decodeCode((a.st[b + 2] << 16) | (a.st[b + 3] << 8) | a.st[b + 4], m);
        r.tid = tid; r.lid = lid; r.sid = primary.sid;
        // FLAGGED, because these records are outside the validation the rest of this table carries. The
        // methodology's cross-check compares the primary table against the shipped single-press table over the
        // 599 bins where the two methods overlap - 599 identical, 0 differing - and the alternates are not in
        // it. Running that same comparison over the alternates finds every one of the four that is checkable
        // (a plateau-0 route with no backouts and no OPTION step, which IS the single-press method, at a wait
        // the single-press table covers) contradicting it: the first claims a route to Trainer ID 0, which
        // does not occur anywhere in the single-press table. That is not proof the alternates are wrong - only
        // the sweep harness can settle it - but it is enough that the page must not present them as though
        // they carried the primary table's evidence.
        r.fromAlternate = true;
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
  // WHAT MACHINE AND WHAT ROM. Both of these cost the owner four real attempts on 2026-09-20 and they cost
  // them for the same reason: the route was RIGHT and the machine underneath it was not the one it was measured
  // on, and NOTHING on screen said so.
  //
  //  - ROM revision. This was FIRST BLAMED for three of those attempts and that was WRONG, measured 2026-09-20:
  //    the owner ran `crystal_11_built.gbc` (sha1 f2f52230...) against a table derived on 1.0 (f4cd194b...), and
  //    replaying the same route on BOTH binaries at W=680/684/688/692/696 gave byte-identical output. The two
  //    revisions differ in 584 bytes, none of which touch this path. The sha1 is printed because provenance
  //    should be checkable, NOT because a revision mismatch is a known cause of a miss - it is not one. All four
  //    of those attempts were the console, below. Do not re-derive the revision claim from the sha1 being here.
  //  - Console. This table is GBA silicon with the GBA flag set (Game Boy Player / GBA / GBA SP). A plain Game
  //    Boy Color is a DIFFERENT MACHINE for this purpose: the flag changes the initial register state, which
  //    changes the divider that seeds the Gen 2 RNG. And it is invisible - MEASURED on gambatte-core, the menu
  //    detector fires at frame 2776 and the two backouts land at 2885 and 2994 on BOTH, identically. Every
  //    number a person can observe agrees. Only the rolled Trainer ID differs: the inputs that give 28489 on
  //    a Game Boy Player give 37552 on a Game Boy Color. There is no symptom to notice and no way to catch it
  //    by being careful, so the script has to say it.
  //
  // hardware() is deliberately a THROW and not a default. A route printed without naming its console and its
  // ROM is the defect this exists to prevent, so scriptLines() calls it before it writes a single step: a
  // table that ever ships without these fields fails loudly here instead of quietly sending someone to the
  // wrong machine again.
  // A missing sha1 is reported, never omitted. Throwing here was the first shape of this check and it was
  // wrong: gold and silver ship rom_sha1: null (make_psr2.py writes cfg['rom'], which is None for both), so a
  // throw took two working games off the air to punish a data gap. Silence would be worse still - that is the
  // exact failure this whole block exists to stop. So an absent sha1 becomes a stated absence: the card says
  // the table does not record which ROM it was derived on, which is information the runner needs and pressure
  // to fill it in. Only console_name is fatal, because without it a route cannot name its machine at all.
  function sha1OrNull(v) { return (typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)) ? v : null; }
  function hardware(m) {
    if (typeof m.console_name !== 'string' || !m.console_name.trim())
      fail('gen2-psr.json ' + (m.id || '?') + ' has no console_name; a route must not be shown without the machine it was measured on');
    return { console: m.console_name.trim(), rom: sha1OrNull(m.rom_sha1), bios: sha1OrNull(m.bios_sha1) };
  }
  // The console_name in the data is one long sentence meant for a caption. The script needs the short name
  // first and the qualification after it, so split on the colon the builder writes.
  function consoleShort(hw) { var i = hw.console.indexOf(':'); return i === -1 ? hw.console : hw.console.slice(i + 1).trim(); }

  var VISIBLE_MENU_LAG = 4;
  function scriptLines(D, r) {
    var f = fps(D), pl = r.plateau, m = r.methodology, out = [];
    var bF = m.backout_b_frames, bTol = m.backout_b_tolerance || [], oF = m.option_down_to_a_frames;
    // A script is read away from the screen, and until now nothing in it said which game it was for. The three
    // games' plateaus differ - Gold's plateau 2 is frames 707-726, Crystal's is 804-869 - so a script carried to
    // the wrong cartridge is a perfectly followable set of instructions that cannot produce the Trainer ID at the
    // top of it. It now says, in the first line, what it is for.
    // Gold and Silver pick a table by the cartridge clock's day bracket; Crystal does not, and saying "clock
    // state days0" on a Crystal script asserts something the data denies (gen2-tid.json rtc.crystal: immune,
    // because pokecrystal switches the LCD on before StartClock). rtcStates() calls Crystal's single table
    // days0 for want of another name, and that internal label was leaking into the runner's instructions.
    var clockDependent = !!m.rtc_tables, hw = hardware(m);
    out.push('This script is for ' + m.game
      + (clockDependent ? ', with the cartridge clock in state ' + r.rtcState : '')
      + '. It will not give this Trainer ID on another game'
      + (clockDependent ? ' or with the clock in another state' : '')
      + ': the three games\' hold plateaus are in different places, so the same steps followed on the wrong '
      + 'cartridge are followable and wrong.'
      + (clockDependent ? '' : ' ' + m.game.replace(/ \(.*/, '') + ' does not depend on the cartridge clock at all, so there is no clock state to match.'));
    out.push('It is also for ONE console: ' + consoleShort(hw) + '. A plain Game Boy Color is not that machine and '
      + 'will not give this Trainer ID. Nothing on screen tells you which one you are on - measured on the reference '
      + 'core, the menu and both backouts land on the SAME frames either way, and only the rolled Trainer ID differs - '
      + 'so check the setting before you start rather than looking for a symptom. On an emulator that means the '
      + 'Game Boy Player / GBA platform mode, not Game Boy Color.');
    out.push(hw.rom
      ? 'Derived on ONE ROM: sha1 ' + hw.rom + '. Run `sha1sum` on the file you are about to load if you want to '
        + 'check the provenance. A revision mismatch is NOT a known cause of a miss: Crystal 1.0 and 1.1 were replayed '
        + 'side by side on this route and produced identical Trainer IDs. The console above is the one that matters.'
        + (hw.bios ? ' The boot ROM must be sha1 ' + hw.bios + '.' : '')
      : 'THIS TABLE DOES NOT RECORD WHICH ROM IT WAS DERIVED ON. That is a gap in the data, not a sign that any copy '
        + 'will do: a different revision of ' + m.game + ' is a different binary and gives a different Trainer ID. '
        + 'Until the sha1 is recorded, treat this route as unverified for your copy.'
        + (hw.bios ? ' The boot ROM must be sha1 ' + hw.bios + '.' : ''));
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
    var btn = waitEndButton(r);
    out.push(r.waitFrames === 0
      ? 'Do not wait: go straight on.'
      : fromBox <= 0
        ? 'Wait ' + r.waitFrames + ' frames from the menu, doing nothing. NOTE: this route is measured from a point '
          + VISIBLE_MENU_LAG + ' frames BEFORE the menu box is drawn, so it cannot be timed off the box you can see. '
          + 'Pick a different Trainer ID unless you can count from the frame the menu data loads.'
        : 'THE ONE TIMED PRESS. Wait ' + fromBox + ' frames (' + (fromBox / f).toFixed(2) + ' s) from the moment the menu box '
          + 'appears, then press ' + waitEndWhat(r) + '. Use the cue below rather than counting - you can be '
          + WAIT_WINDOW.early + ' frames early or only ' + WAIT_WINDOW.late + ' frame late ('
          + ((WAIT_WINDOW.early + WAIT_WINDOW.late + 1) / f * 1000).toFixed(0) + ' ms in total, and NOT centred on the '
          + 'number above), so the cue aims half a frame earlier to sit in the middle of it.');
    if (r.opt) out.push('That DOWN was the timed press. Then press A ' + oF + ' frames later (' + (oF / f).toFixed(2)
      + ' s) to enter OPTION - the cue sounds a second time for it - and hold START until the main menu reloads. '
      + 'The gap between DOWN and A is itself only a few frames wide.');
    for (var j = 0; j < r.post; j++) out.push(backout('Back out and return again (' + (j + 1) + ' of ' + r.post + ')'));
    out.push((btn === 'A' ? 'That press was the A on NEW GAME: HOLD IT DOWN. ' : 'Press A on NEW GAME and HOLD IT DOWN. ')
      + 'Do not release it until the game has started - holding it out is what makes this press forgiving, and releasing '
      + 'early is the usual way to miss.');
    return out;
  }
  // ---- the timed press, and the cue for it -----------------------------------------------------------
  // Only ONE thing in this protocol needs a timer: the input that ends the measured wait. Everything else
  // is buffered (hold the button through the transition and the game takes it on the first frame it can).
  //
  // Two facts that are easy to get wrong and both change what the cue must do:
  //  1. The stored W counts from the menu DETECTOR, which fires visible_menu_lag_frames before the box is
  //     drawn. A person can only see the box, so the press is W - lag frames after what they observe.
  //  2. The window is NOT centred on W. Measured over 2,003 routes on the emulator, a press still gives
  //     the prescribed Trainer ID from W-2 to W+1 and nowhere else - 4 frames wide, but asymmetric. Aiming
  //     at W therefore leaves only one frame of lateness. The cue aims at the middle of the real window.
  var WAIT_WINDOW = { early: 2, late: 1 };          // frames, measured; see psr-sweep tolerance run
  function waitWindowCentreOffset() { return (WAIT_WINDOW.late - WAIT_WINDOW.early) / 2; }   // -0.5 frames

  // Which button ends the wait. It is NOT always A: the harness presses DOWN first when the route has an
  // OPTION step, and B first when it has post-backouts. Only a route with neither ends the wait on the
  // held NEW GAME press. Telling someone to time "the A press" is wrong for about 80% of routes.
  function waitEndButton(r) { return r.opt ? 'DOWN' : (r.post > 0 ? 'B' : 'A'); }
  function waitEndWhat(r) {
    return r.opt ? 'DOWN, to start the OPTION step'
      : (r.post > 0 ? 'B, to start the next backout' : 'A on NEW GAME, held out until the game starts');
  }
  // seconds from the moment the menu box is VISIBLE to the timed press, at the centre of the real window
  function waitPressSeconds(D, r) {
    var m = r.methodology, lag = (D.gen2 && D.gen2.visible_menu_lag_frames) || VISIBLE_MENU_LAG;
    return (r.waitFrames - lag + waitWindowCentreOffset()) / fps(D);
  }
  // count-in beeps, then a tone at the press. G1 is ShinyGen1Tid, for countInCues and the tone constants.
  function cueProgram(G1, D, r, correctionMs, beeps, spacingS) {
    var t = waitPressSeconds(D, r) - (correctionMs || 0) / 1000;
    if (!(t > 0)) return null;                       // the press lands at or before the anchor: not cueable
    var ci = G1.countInCues(t, beeps == null ? 4 : beeps, spacingS == null ? 1.0 : spacingS, 0.5);
    var cues = ci.cues.slice(), btn = waitEndButton(r);
    cues.push(btn === 'A'
      ? { t: t, freq: G1.A_CUE_TONE[0], ms: G1.A_CUE_TONE[1], label: 'A', kind: 'A' }
      : { t: t, freq: G1.A_CUE_TONE[0], ms: G1.A_CUE_TONE[1], label: btn, kind: 'press' });
    // an OPTION route needs a second timed press: A goes down a fixed gap after DOWN, and that gap is
    // itself only a few frames wide, so it gets its own tone rather than being left to feel.
    if (r.opt) {
      var gap = (r.methodology.option_down_to_a_frames || 8) / fps(D);
      cues.push({ t: t + gap, freq: G1.A_CUE_TONE[0], ms: G1.A_CUE_TONE[1], label: 'A', kind: 'press' });
    }
    cues.sort(function (a, b) { return a.t - b.t; });   // the engine does not sort, and overlap resolution depends on order
    return { cues: cues, tPress: t, dropped: ci.dropped };
  }
  // ---- the reverse table: what did I actually do? ---------------------------------------------------
  // WHY THIS SHIPS, AND WHY IT IS WORTH ITS SIZE. Until now this mode was the only one with no
  // "what did you get?" box, and the card said so: working a Trainer ID back to a wait frame needs a
  // reverse table the bundle did not carry. On 2026-09-20 the owner ran the Crystal route eight times on
  // a GBA SP and the difference between "eight random failures" and "a +10 frame bias, correct it by
  // -170 ms" was exactly this lookup, done by hand each time. A manip you cannot debug is a manip you
  // cannot learn, so the table ships.
  //
  // SIZE. The forward table hands out only 252 of the 512 possible (plateau, pre, opt, post) families, so
  // the reverse data is 252 families x 2001 waits x 2 bytes = 0.96 MB raw. Storing every family would be
  // 1.95 MB and storing a per-Trainer-ID neighbourhood would be worse still for less: a per-family map
  // answers ANY target on that family, at any error size, and also identifies the case where the wait was
  // fine and the START press landed in the wrong hold window entirely - which was half of the owner's
  // misses and is the one a neighbourhood table cannot see.
  //
  // W is always a multiple of 4 because the main menu is polled every 4 frames, so 4 frames is the finest
  // distinction that exists; a press anywhere inside a bin gives the same Trainer ID. That is why an
  // answer is a bin, not a frame, and why the advice is always +-2 frames at best.
  function famKey(r) { return [r.plateau.index, r.pre, r.opt ? 1 : 0, r.post].join(','); }
  function reverseTable(m) {
    var rv = m.reverse;
    if (!rv) return null;
    if (!m.__rev) {
      var by = bytes(rv.tids_b64), n = rv.families.length, per = Math.floor(rv.wait_max / rv.wait_step) + 1;
      if (by.length !== n * per * 2)
        fail('gen2-psr.json ' + m.id + ' reverse table is the wrong size (' + by.length + ' bytes for '
             + n + ' families x ' + per + ' waits)');
      var idx = {};
      for (var i = 0; i < n; i++) idx[rv.families[i]] = i;
      // A cell that produced no roll cannot be marked by a reserved Trainer ID: all 65536 of them are real,
      // and 14 cells in the Crystal sweep roll FFFF for real. The table therefore ships the empty cells as
      // an explicit index list, and FFFF in the blob is only filler. Reading the value instead of this list
      // would have told 14 runners their wait produced nothing when it produced Trainer ID 65535.
      var empty = {}, nr = rv.no_roll_idx || [];
      for (var e = 0; e < nr.length; e++) empty[nr[e]] = 1;
      Object.defineProperty(m, '__rev', { value: { by: by, idx: idx, per: per, step: rv.wait_step, fams: rv.families, empty: empty }, enumerable: false });
    }
    return m.__rev;
  }
  // -1 for a cell that rolled nothing, which is never a Trainer ID, so callers can compare without a guard.
  function revTidAt(rev, fi, wi) {
    var i = fi * rev.per + wi;
    if (rev.empty[i]) return -1;
    return (rev.by[i * 2] << 8) | rev.by[i * 2 + 1];
  }
  // Every wait, in frames, that produces `tid` on the family the route belongs to. Empty if none does.
  function waitsFor(rev, fam, tid) {
    var fi = rev.idx[fam], out = [];
    if (fi === undefined) return out;
    for (var w = 0; w < rev.per; w++) if (revTidAt(rev, fi, w) === tid) out.push(w * rev.step);
    return out;
  }
  // The diagnosis. `got` is the Trainer ID the run actually produced; `r` is the route the card gave.
  //   kind 'wait'        - same family, so this was purely a mistimed press; errorFrames says by how much
  //   kind 'elsewhere'   - produced by a DIFFERENT family: the wait was not the problem, the hold was
  //   kind 'unreachable' - not produced by any family this table carries
  //   kind 'target'      - they hit it
  function diagnose(m, r, got) {
    var rev = reverseTable(m);
    if (!rev) return { kind: 'no-table' };
    if (got === r.tid) return { kind: 'target' };
    var fam = famKey(r), here = waitsFor(rev, fam, got);
    if (here.length) {
      // the bin nearest the prescribed wait is the honest reading: a 400-frame "error" on a route whose
      // window is 4 frames is not what a person did, it is the same Trainer ID recurring further out.
      var best = here[0];
      for (var i = 1; i < here.length; i++) if (Math.abs(here[i] - r.waitFrames) < Math.abs(best - r.waitFrames)) best = here[i];
      return { kind: 'wait', waitUsed: best, errorFrames: best - r.waitFrames, allWaits: here };
    }
    var others = [];
    for (var f = 0; f < rev.fams.length && others.length < 4; f++) {
      if (rev.fams[f] === fam) continue;
      var w = waitsFor(rev, rev.fams[f], got);
      if (w.length) others.push({ family: rev.fams[f], waits: w });
    }
    return others.length ? { kind: 'elsewhere', found: others } : { kind: 'unreachable' };
  }
  // Turn a list of attempts into the correction to dial in next.
  // Each attempt is { got: <Trainer ID>, corrMs: <the correction that was in the box at the time> }.
  // The runner's INTRINSIC lateness is what they would do with no correction at all, so the correction
  // already applied has to be added back before averaging - otherwise every round of advice would only
  // ever move the number by half of what is needed and it would crawl towards the answer.
  function recommendCorrection(D, m, r, attempts) {
    var f = fps(D), msPerFrame = 1000 / f, used = [];
    for (var i = 0; i < attempts.length; i++) {
      var d = diagnose(m, r, attempts[i].got);
      if (d.kind !== 'wait' && d.kind !== 'target') continue;             // a wrong hold window says nothing about press timing
      var errFrames = d.kind === 'target' ? 0 : d.errorFrames;
      used.push(errFrames - (Number(attempts[i].corrMs) || 0) / msPerFrame);
    }
    if (!used.length) return { n: 0 };
    var sum = 0; for (var j = 0; j < used.length; j++) sum += used[j];
    var mean = sum / used.length, lo = used[0], hi = used[0];
    for (var k = 1; k < used.length; k++) { if (used[k] < lo) lo = used[k]; if (used[k] > hi) hi = used[k]; }
    return { n: used.length, meanFrames: mean, spreadFrames: hi - lo,
             ms: -Math.round(mean * msPerFrame), msPerFrame: msPerFrame };
  }
  function coverage(D, game, platform) { var m = meth(D, game, platform); return m.coverage; }
  var pure = { meth: meth, routeFor: routeFor, routeForPair: routeForPair, lidsFor: lidsFor, altTables: altTables,
               WAIT_WINDOW: WAIT_WINDOW, waitEndButton: waitEndButton, waitEndWhat: waitEndWhat,
               waitPressSeconds: waitPressSeconds, cueProgram: cueProgram,
               scriptLines: scriptLines, coverage: coverage, covered: covered, tables: tables, fps: fps,
               rtcStates: rtcStates, tableSource: tableSource,
               hardware: hardware, consoleShort: consoleShort,
               reverseTable: reverseTable, waitsFor: waitsFor, famKey: famKey, revTidAt: revTidAt,
               diagnose: diagnose, recommendCorrection: recommendCorrection };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'gen2psr';
    // This mode had no storyboard for a long time, on the reasoning that the canvas draws scenes measured from
    // one traced boot and a prescribed sequence is composed of several. That was a reason not to trace it, not a
    // reason not to draw it: the route's every span is a measured constant in gen2-psr.json, and the buffer
    // guide already composes a timeline the same way. Story.gen2PsrTimeline builds it, and is handed the press
    // second the cue uses rather than working it out again, so the marker and the tone are the same instant.
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
    // THE TWO THINGS THE CARD NEVER SAID, AND WHICH BOTH COST REAL ATTEMPTS ON 2026-09-20.
    // It sat directly above the steps rather than behind a <details>, because the failure it prevents is silent:
    // a wrong console or a wrong ROM revision produces a perfectly followable script and a Trainer ID that is
    // simply not the one at the top of the card. There is no error, no warning and no visible difference in the
    // run - the menu and both backouts land on the SAME frames on a Game Boy Color as on a Game Boy Player -
    // so a person has nothing to notice. The only defence is to state it before they start.
    // hardware() throws when the data lacks either field, so this cannot silently degrade to showing nothing.
    function hardwareHtml(m) {
      var hw = hardware(m);
      return '<div class="small" style="border:1px solid currentColor;border-radius:6px;padding:.5em .7em;margin:.4em 0;opacity:.95">'
        + '<p style="margin:.1em 0"><b>Check these two before you start.</b> Both are silent when wrong: the script '
        + 'still runs, the frames still match, and the Trainer ID is just a different one.</p>'
        + '<p style="margin:.35em 0"><b>Console:</b> ' + esc(consoleShort(hw)) + '.<br>'
        + '<span class="muted">A plain Game Boy Color is a different machine here. On an emulator, set the platform to '
        + 'Game Boy Player / GBA, not Game Boy Color.</span></p>'
        + (hw.rom
            ? '<p style="margin:.35em 0"><b>ROM:</b> <code>' + esc(hw.rom) + '</code><br>'
              + '<span class="muted">' + esc(m.game) + ' - the copy the table was measured on; check yours with '
              + '<code>sha1sum</code> if you want to confirm provenance. Revisions 1.0 and 1.1 were replayed side by '
              + 'side on this route and gave identical Trainer IDs, so a revision mismatch is not a known cause of a '
              + 'miss. The console is.</span></p>'
            : '<p style="margin:.35em 0"><b>ROM:</b> <b>not recorded by this table.</b><br>'
              + '<span class="muted">A gap in the data, not permission to use any copy: another revision of '
              + esc(m.game) + ' is a different binary and gives a different Trainer ID.</span></p>')
        + (hw.bios ? '<p style="margin:.35em 0 .1em"><b>Boot ROM:</b> <code>' + esc(hw.bios) + '</code></p>' : '')
        + '</div>';
    }
    // ---- "what did you get?" -------------------------------------------------------------------
    // Every other mode has this box. This one could not have it until the reverse table shipped, and the
    // cost of not having it was measured: eight attempts on a GBA SP that looked like eight unrelated
    // Trainer IDs were, once looked up, four presses at +4/+8/+12/+16 frames and four runs where the START
    // press had landed in the wrong hold window. Neither fact is visible without the lookup, and the first
    // one is a bias a single number fixes.
    //
    // Attempts are kept per game AND per target, because a correction learned for one route is about the
    // runner's reaction time and not about the route - but mixing in attempts at a different target would
    // mix in a different plateau's geometry, so they are not pooled.
    var WAIT_WINDOW_WIDTH = WAIT_WINDOW.early + WAIT_WINDOW.late + 1;
    function triesKey(game, tid) { return 'tries.' + game + '.' + tid; }
    function tries(game, tid) {
      var v = A.pref(SEC, triesKey(game, tid));
      return Array.isArray(v) ? v : [];
    }
    function setTries(game, tid, list) { var o = {}; o[triesKey(game, tid)] = list; A.setPref(SEC, o); }
    function famWords(D, m, fam) {
      var q = fam.split(',').map(Number), pl = m.plateaus[q[0]];
      return 'START held from frame ' + pl.hold_lo_frame + '-' + pl.hold_hi_frame
        + ', ' + (q[1] + q[3]) + ' backout' + (q[1] + q[3] === 1 ? '' : 's') + (q[2] ? ' and an OPTION step' : '');
    }
    function tryLine(D, m, r, t) {
      var d = diagnose(m, r, t.got), f = fps(D), ms = 1000 / f;
      var head = '<b>' + esc(A.fmtTid(t.got)) + '</b>' + (t.corrMs ? ' <span class="muted">(correction ' + (t.corrMs > 0 ? '+' : '') + Math.round(t.corrMs) + ' ms)</span>' : '');
      if (d.kind === 'target') return head + ' - <b>that is the target.</b>';
      if (d.kind === 'no-table') return head + ' - this bundle carries no reverse table for ' + esc(m.game) + '.';
      if (d.kind === 'wait') {
        var n = d.errorFrames, late = n > 0;
        return head + ' - the hold was right; the press was <b>' + Math.abs(n) + ' frame' + (Math.abs(n) === 1 ? '' : 's') + ' '
          + (late ? 'LATE' : 'EARLY') + '</b> (' + (late ? '+' : '-') + Math.abs(n * ms).toFixed(0) + ' ms).';
      }
      if (d.kind === 'elsewhere') {
        return head + ' - <b>not a timing miss.</b> That Trainer ID comes from a different script: '
          + esc(famWords(D, m, d.found[0].family)) + '. Your START press landed in the wrong hold window, so the '
          + 'wait afterwards could not have helped.';
      }
      return head + ' - no script in this table produces that Trainer ID. Check the console and ROM above before anything else.';
    }
    function triesHtml(game, r) {
      var D = A.D, m;
      try { m = meth(D, game); } catch (e) { return ''; }
      if (!r) return '';
      if (!reverseTable(m)) {
        var have = Object.keys(D.gen2psr.games).filter(function (g) {
          try { return !!reverseTable(meth(D, g)); } catch (e2) { return false; }
        });
        return '<p class="small muted">No "what did you get?" box for ' + esc(m.game) + ' yet: reading a Trainer ID back '
          + 'to a wait needs a reverse table, and this bundle carries one for '
          + (have.length ? esc(have.join(', ')) : 'no game yet') + '. Until it does, the two nudge buttons above are the '
          + 'honest tool - each is one frame, and they set the correction arithmetically, so a negative value works.</p>';
      }
      var list = tries(game, r.tid), rec = recommendCorrection(D, m, r, list);
      var h = '<hr><p class="small"><b>What did you get?</b> Type the Trainer ID the run actually produced. '
        + 'The correction in the box above is recorded with it, so the advice stays right as you change it.</p>'
        + '<div class="row"><label class="field">Trainer ID you got<input type="text" inputmode="numeric" id="g2psr-got" placeholder="e.g. 27355 or $6ADB"></label>'
        + '<button type="button" id="g2psr-add">Add</button></div>';
      if (list.length) {
        h += '<ul class="plain small">' + list.map(function (t, i) {
          return '<li>' + tryLine(D, m, r, t) + ' <button type="button" class="link" data-g2psr-drop="' + i + '">remove</button></li>';
        }).join('') + '</ul>';
      }
      if (rec.n) {
        var same = Math.abs((Number(p('corr', game, 0)) || 0) - rec.ms) < 1;
        h += '<p class="small"><b>Recommended correction: ' + (rec.ms > 0 ? '+' : '') + rec.ms + ' ms</b>'
          + ' <span class="muted">(from ' + rec.n + ' timed attempt' + (rec.n === 1 ? '' : 's') + ': you press on average '
          + (rec.meanFrames >= 0 ? '' : '-') + Math.abs(rec.meanFrames).toFixed(1) + ' frames '
          + (rec.meanFrames >= 0 ? 'late' : 'early') + ', spread ' + rec.spreadFrames.toFixed(1) + ' frames)</span>'
          + (same ? ' <span class="muted">- already applied.</span>' : ' <button type="button" id="g2psr-usecorr">Use it</button>') + '</p>'
          + (rec.n < 3 ? '<p class="small muted">Two or three more attempts will make this number worth trusting; one attempt is a guess.</p>' : '')
          + (rec.spreadFrames > 8 ? '<p class="small muted">Your spread is wider than the ' + WAIT_WINDOW_WIDTH + '-frame window, so a correction alone will not land it every time - it moves the middle of your scatter onto the target.</p>' : '');
      } else if (list.length) {
        h += '<p class="small muted">None of those were timing misses, so there is nothing to correct yet - fix the hold window first.</p>';
      }
      if (list.length) h += '<p class="small"><button type="button" id="g2psr-clear">Clear attempts</button></p>';
      return h;
    }
    function corrNote(ms) {
      return ms ? ' (with your ' + (ms > 0 ? '+' : '') + ms.toFixed(0) + ' ms correction)' : '';
    }
    function setCorrNote(ms) { var n = A.$('g2psr-corrnote'); if (n) n.textContent = corrNote(ms); }
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
        // scoped to THIS game. It used to read "by any script in this sweep", which is a claim about all three
        // games and is usually false: 28489 with Lucky ID 56870 has no route on Crystal and a perfectly good one
        // on Gold. A runner told the pair was impossible, who then found it on another game, has every reason to
        // believe the route will work on the cartridge they already had in.
        return '<p>' + esc(A.fmtTid(tid)) + ' cannot be paired with Lucky ID ' + esc(A.fmtTid(lidWanted))
          + ' on <b>' + esc(m.game) + '</b> (cartridge clock ' + esc(st) + ').</p><p class="small">On this game it reaches ' + avail.length + ' Lucky ID'
          + (avail.length === 1 ? '' : 's') + ': ' + avail.slice(0, 24).map(function (x) { return esc(A.fmtTid(x.lid)); }).join(', ')
          + (avail.length > 24 ? ', and more' : '') + '.</p>'
          + carriedByHtml(carriedBy(D, tid, lidWanted, game, st));
      }
      if (!r) {
        var cv = tableSource(m, st).coverage;
        return '<p>' + esc(A.fmtTid(tid)) + ' is one of the ' + (65536 - cv.tids_covered)
          + ' Trainer IDs (' + (100 - cv.percent).toFixed(2) + '%) the ' + esc(m.game) + ' sweep never produced'
          + (st !== 'days0' ? ' in cartridge-clock state ' + esc(st) : '') + '. '
          + 'Try the timed tap method for it, or pick another ID.</p>'
          + carriedByHtml(carriedBy(D, tid, null, game, st));
      }
      var extra = r.pre + (r.opt ? 1 : 0) + r.post;
      // an alternate carries less evidence than a primary, and the page says which one this is
      var altWarn = r.fromAlternate
        ? '<p class="small warn"><b>This is an alternate route.</b> The cross-check that validates this table - '
          + m.crosscheck.bins_compared + ' bins compared against the shipped single-press table, '
          + m.crosscheck.identical + ' identical, ' + m.crosscheck.differ_more + ' differing - covers the primary '
          + 'route of each Trainer ID, not the alternates kept for exact Lucky ID pairs. Running that same '
          + 'comparison over the alternates, every one of the four that can be checked disagrees with it. Treat '
          + 'an exact (Trainer ID, Lucky ID) pair as unverified until the sweep harness is re-run over them; the '
          + 'route you get by leaving the Lucky ID box empty is the validated one.</p>'
        : '';
      return hardwareHtml(m) + altWarn + '<p><b>' + esc(A.fmtTid(tid)) + '</b> - Lucky ID ' + esc(A.fmtTid(r.lid))
        + (rollsSid(m) ? ', Secret ID ' + esc(A.fmtTid(r.sid)) : '')
        + (rtcStates(m).length > 1 ? ' <span class="muted">(cartridge clock: ' + esc(r.rtcState) + ')</span>' : '') + '.</p>'
        + '<p class="small muted">Hold window ' + r.plateau.width_frames + ' frames'
        + (extra === 0 ? ', no backouts' : ', ' + (r.pre + r.post) + ' backout' + (r.pre + r.post === 1 ? '' : 's') + (r.opt ? ' and an OPTION step' : ''))
        + ', wait ' + r.waitFrames + ' frames.</p>'
        + '<ol class="plain">' + scriptLines(D, r).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
    }
    // WHY A TYPED ID CAN VANISH. This branch used to read "Type a Trainer ID above to build the cue" whatever
    // had happened, including when a Trainer ID HAD been typed and simply had no route on the chosen game or
    // clock state. Adding a Lucky ID is the sharp case: Trainer ID 28489 has a route on Crystal, and 28489 with
    // Lucky ID 56870 has one only on Gold, so typing the pair on Crystal made the whole card disappear and told
    // the runner to do the thing they had just done. Somebody in that position flips to another game, gets a
    // route, and runs it on the cartridge they started with - which is a different game's plateau and cannot
    // give the Trainer ID at the top of the script. So when there is no route here, say so, and say where it is.
    // Where a Trainer ID, or an exact (Trainer ID, Lucky ID) pair, IS carried. The three games' tables are
    // separate sweeps and their hold plateaus sit in different places, so "not here" and "nowhere" are very
    // different answers to give a runner - and only one of them is usually true.
    function carriedBy(D, tid, lid, exceptGame, exceptState) {
      var out = [], askedPair = Number.isInteger(lid);
      Object.keys(D.gen2psr.games).forEach(function (g) {
        var mg;
        try { mg = meth(D, g); } catch (e) { return; }
        if (askedPair) {
          var rp = null;
          try { rp = routeForPair(D, tid, lid, g); } catch (e) { rp = null; }
          if (rp) out.push({ game: g, name: mg.game, state: rp.rtcState });
          return;
        }
        rtcStates(mg).forEach(function (st) {
          var rr = null;
          try { rr = routeFor(D, tid, g, PLATFORM, st); } catch (e) { rr = null; }
          if (rr && !(g === exceptGame && st === exceptState)) out.push({ game: g, name: mg.game, state: st });
        });
      });
      return out;
    }
    function carriedByHtml(list) {
      if (!list.length) return '<p class="small muted">No game and no cartridge-clock state in this data reaches it, so the sweep never produced it anywhere. That is not a fault in your run.</p>';
      return '<p class="small good">It IS reachable on: <b>' + list.map(function (x) { return esc(x.name + ' (clock ' + x.state + ')'); }).join('</b>; <b>') + '</b>. '
        + 'Switch to that game here <em>and run it on that cartridge</em>: these steps are not portable between the three games, because their hold plateaus are in different places.</p>';
    }
    function noRouteHtml(D, game, tid, lid) {
      if (!Number.isInteger(tid)) return '<p class="muted">Type a Trainer ID above to build the cue.</p>';
      var state = stateOf(game), askedPair = Number.isInteger(lid);
      return '<p class="warn">No cue: there is no route on <b>' + esc(meth(D, game).game) + '</b> with the cartridge clock in <b>'
        + esc(state) + '</b> for Trainer ID ' + esc(A.fmtTid(tid))
        + (askedPair ? ' with Lucky ID ' + esc(A.fmtTid(lid)) : '') + '. The card above says what is reachable instead.</p>'
        + '<p class="small muted">The cue is built from a route, so it appears as soon as one does - on every game and every '
        + 'cartridge-clock state this method covers.</p>';
    }
    function render(el, game) {
      var D = A.D, m, c;
      try { m = meth(D, game); } catch (e) {
        el.innerHTML = A.card('<h3>Not derived for this game</h3><p class="small">' + esc(A.errMsg ? A.errMsg(e) : String(e.message || e)) + '</p>');
        return;
      }
      c = m.coverage;
      // THE GAME, FIRST. This heading used to be m.name - the methodology's description, which is byte-identical
      // on Gold, Silver and Crystal - so the page looked exactly the same whichever game you had chosen, and the
      // only text identifying it was the methodology id most of the way down the status card at the bottom.
      // Every sibling mode names its game here (page-gen2.js "Timed tap method: Pokemon Gold (English)",
      // page-gen1-timed.js, page-gen1-buffer.js, page-gen3-sid.js); this one was the exception. A runner read a
      // Gold script with a Crystal cartridge in the console, and nothing on screen could have told them: Gold's
      // hold plateau is frames 707-726 and on Crystal those frames are in no plateau at all.
      var h = '<h2>Prescribed sequence: ' + esc(m.game) + '</h2>'
        + '<p class="small muted">' + esc(m.name) + '</p>';
      h += A.card('<h3>What this is</h3>'
        + '<p class="small">' + esc(D.gen2psr.what_this_is) + '</p>'
        + '<p class="small"><b>Coverage.</b> ' + c.tids_covered.toLocaleString() + ' of 65,536 Trainer IDs (' + c.percent
        + '%) have a script here, from ' + c.boots.toLocaleString() + ' emulator boots.</p>'
        + (m.rtc_note ? '<p class="small muted"><b>Cartridge clock.</b> ' + esc(m.rtc_note) + '</p>' : '')
        + '<p class="small muted">' + esc(m.console_name) + ' only. ' + esc(D.gen2psr.not_derived[0]) + '</p>');
      // The count comes from the list. This read "Only two things are timed:" in front of four of them, two of
      // which are deadlines a runner told otherwise would simply miss - the backout's B-to-START switch and the
      // OPTION step. The data had already been corrected and carries timed_elements_note saying so in as many
      // words; the note was rendered nowhere and the sentence in front of it was never updated.
      var te = D.gen2psr.timed_elements, teWords = ['nothing', 'one thing', 'two things', 'three things', 'four things', 'five things'];
      h += A.card('<h3>Buffered presses</h3><p class="small">' + esc(D.gen2psr.buffering) + '</p>'
        + '<p class="small"><b>' + esc(te.length < teWords.length ? teWords[te.length].replace(/^./, function (ch) { return ch.toUpperCase(); }) : te.length + ' things') + ' are timed</b>, and every one of them can lose the attempt on its own: '
        + te.map(esc).join('; and ') + '.</p>'
        + (D.gen2psr.timed_elements_note ? '<p class="small warn">' + esc(D.gen2psr.timed_elements_note) + '</p>' : ''));
      if (rtcStates(m).length > 1) {
        var st0 = stateOf(game);
        h += A.card('<h3>Cartridge clock</h3>'
          + A.choices('g2psr-rtc', rtcStates(m).map(function (k) {
              var src = tableSource(m, k);
              return { id: k, title: k === 'days0' ? 'Fresh clock (days0)' : (src.label || k),
                       sub: src.coverage.tids_covered.toLocaleString() + ' Trainer IDs (' + src.coverage.percent + '%)' };
            }), st0)
          // The owner of this tool asked what a clock state was, which is as good a sign as one gets that the
          // term needed explaining before it was used. It was named in the picker, in the status block and, as
          // of today, in the first line of every printed script, and defined nowhere.
          + '<details class="small"><summary>What is a cartridge clock state?</summary>'
          + '<p>A Gen 2 cartridge has a real clock in it, ticking on its own battery. On Gold and Silver the game '
          + 'reads that clock <b>before it switches the screen on</b>, and the work it does depends on how many days '
          + 'the clock has counted - so the number of days changes how much time passes before the first frame is '
          + 'drawn, and that shifts everything this method measures from. The day count therefore selects which '
          + 'table of Trainer IDs applies.</p>'
          + '<p><b>Which state am I in?</b> Almost always the fresh one (days0): under 140 days on the clock. The game '
          + 'rewrites the day counter back under 140 as it boots, so any other bracket lasts for a single boot and the '
          + 'next one is back to days0. A cartridge with a dead or replaced battery, an emulator, or one you have booted '
          + 'recently is in days0.</p>'
          + '<p>' + esc((A.D.gen2 && A.D.gen2.rtc && A.D.gen2.rtc.structural) ? 'In the decompilation: ' + A.D.gen2.rtc.structural.slice(0, 300) + '...' : '') + '</p>'
          + '</details>'
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
      // the cue: the one thing that makes any of this performable
      var rCur = null, tidCur = parseTid(p('tid', game, ''));
      if (Number.isInteger(tidCur)) {
        var lidCur = parseTid(p('lid', game, ''));
        try { rCur = Number.isInteger(lidCur) ? routeForPair(D, tidCur, lidCur, game) : routeFor(D, tidCur, game, PLATFORM, stateOf(game)); } catch (e) { rCur = null; }
      }
      var corrMs = Number(p('corr', game, 0)) || 0;
      var frameMs = 1000 / fps(D);
      h += A.card('<h3>Cue</h3>' + (rCur
        ? '<p class="small">Tap Run, then tap again the moment the <b>menu box appears</b> after your last backout. '
          + 'The count-in leads to the press at <b>' + A.fmtS(waitPressSeconds(D, rCur), 2) + '</b> after that'
          + '<span id="g2psr-corrnote">' + corrNote(corrMs) + '</span>'
          + ', and the press to make is <b>' + esc(waitEndButton(rCur)) + '</b>'
          + (rCur.opt ? ', followed by a second tone for the A' : '') + '.</p>'
          + A.widgets.storyWidgetHtml('g2psr-story', 'the menu box appearing', null)
          + '<div class="row"><label class="field">Correction (ms, + = cue later)'
          + '<input type="number" step="1" inputmode="numeric" id="g2psr-corr" value="' + corrMs + '"></label></div>'
          + '<p class="small"><button type="button" data-g2psr-nudge="-1">1 frame earlier</button> '
          + '<button type="button" data-g2psr-nudge="1">1 frame later</button> '
          + '<span class="muted">one frame is ' + frameMs.toFixed(1) + ' ms. If you keep landing on the Trainer ID one bin off, nudge and try again.</span></p>'
          + triesHtml(game, rCur)
          + A.toolsHtml(['flowtimer'], 'This count-in and tone is the job FlowTimer does for the Gen 1 and Gen 2 manips:')
        : noRouteHtml(D, game, tidCur, Number.isInteger(tidCur) ? parseTid(p('lid', game, '')) : null)));
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
      if (rCur) A.widgets.mountStory({ id: 'g2psr-story', gameName: game, previewLead: 0.5,
        timeline: function () {
          return A.Story.gen2PsrTimeline(A.D, rCur, { pressSeconds: waitPressSeconds(A.D, rCur), endButton: waitEndButton(rCur), endWhat: waitEndWhat(rCur) });
        },
        program: function () {
          // read the correction from prefs, NOT from the corrMs captured at render time: typing in the
          // correction box deliberately does not re-render (see onEvent), so a captured value would go stale
          // and the tones would stop matching the number on screen.
          var c = cueProgram(A.G1, A.D, rCur, Number(p('corr', game, 0)) || 0, Number(p('beeps', game, 4)) || 0, 1.0);
          if (!c) return { cues: [], visuals: [], endT: 1, label: 'the wait is too short to cue from the visible menu' };
          return { cues: c.cues, visuals: A.Cue.visualsFor(c.cues, A.Cue.A_HOLD_S), endT: c.tPress + 3.0,
                   label: meth(A.D, game).id + ' ' + A.fmtTid(rCur.tid) + ' - press ' + waitEndButton(rCur) };
        } });
    }
    function onEvent(ev, game) {
      // ---- "what did you get?" controls ----------------------------------------------------------
      // routeNow() rather than a captured route: the panel is keyed to the target currently typed in, and
      // the attempt list lives under that target's Trainer ID.
      function routeNow() {
        var t = parseTid(p('tid', game, ''));
        if (!Number.isInteger(t)) return null;
        var l = parseTid(p('lid', game, ''));
        try { return Number.isInteger(l) ? routeForPair(A.D, t, l, game) : routeFor(A.D, t, game, PLATFORM, stateOf(game)); }
        catch (e) { return null; }
      }
      if (ev.type === 'click' && ev.target && ev.target.id === 'g2psr-add') {
        var rAdd = routeNow(), box = A.$('g2psr-got'), gotV = box ? parseTid(box.value) : null;
        if (rAdd && Number.isInteger(gotV)) {
          var listA = tries(game, rAdd.tid).slice();
          listA.push({ got: gotV, corrMs: Number(p('corr', game, 0)) || 0 });
          setTries(game, rAdd.tid, listA);
          return 'render';
        }
        return null;
      }
      var drop = ev.type === 'click' && ev.target && ev.target.closest && ev.target.closest('[data-g2psr-drop]');
      if (drop) {
        var rD = routeNow();
        if (rD) {
          var lD = tries(game, rD.tid).slice();
          lD.splice(Number(drop.getAttribute('data-g2psr-drop')), 1);
          setTries(game, rD.tid, lD);
          return 'render';
        }
        return null;
      }
      if (ev.type === 'click' && ev.target && ev.target.id === 'g2psr-clear') {
        var rC = routeNow(); if (rC) { setTries(game, rC.tid, []); return 'render'; }
        return null;
      }
      if (ev.type === 'click' && ev.target && ev.target.id === 'g2psr-usecorr') {
        var rU = routeNow(); if (!rU) return null;
        var recU = recommendCorrection(A.D, meth(A.D, game), rU, tries(game, rU.tid));
        if (!recU.n) return null;
        var oU = {}; oU['corr.' + game] = recU.ms; A.setPref(SEC, oU);
        return 'render';
      }
      // the Trainer-ID-you-got field is typed into: same rule as every other input here, never re-render
      if (ev.type !== 'click' && ev.target && ev.target.id === 'g2psr-got') return null;

      // THE CORRECTION BOX MUST NOT RE-RENDER. It used to return 'render' on every keystroke, which rebuilt
      // the card, destroyed the focused <input> and so closed the phone keyboard after every single digit -
      // typing "-170" meant four taps into the box with a scroll between each. The Trainer ID field three
      // lines below already carried the comment saying exactly this; the correction box just never got the
      // same treatment. Patch the one span that depends on it and leave the DOM alone.
      var nudge = ev.type === 'click' && ev.target && ev.target.closest && ev.target.closest('[data-g2psr-nudge]');
      if (nudge) {
        var by = Number(nudge.getAttribute('data-g2psr-nudge')) * (1000 / fps(A.D));
        var next = Math.round((Number(p('corr', game, 0)) || 0) + by);
        var o4 = {}; o4['corr.' + game] = next; A.setPref(SEC, o4);
        var box = A.$('g2psr-corr'); if (box) box.value = next;   // the buttons and the box are one value
        setCorrNote(next);
        return null;
      }
      if (ev.type !== 'click' && ev.target && ev.target.id === 'g2psr-corr') {
        var v5 = Number(ev.target.value) || 0;
        var o5 = {}; o5['corr.' + game] = v5; A.setPref(SEC, o5);
        setCorrNote(v5);
        return null;
      }
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
