// TID Helper page: Gold / Silver / Crystal (the hold-START single-tap methodologies), a port of the site's Gen 2 flow
// (src/app/rng-solution/gen2.tsx): platform (and, on a DMG, which protocol) -> methodology (ShinyGen2Tid.methodologyFor)
// -> RTC state (Gold / Silver select a table by the cartridge clock's day bracket; Crystal is immune) -> target (the
// route's sets over every RTC state, or a typed Trainer ID with an optional Lucky ID inverted through the tables) ->
// anchor -> correction -> the cue (scheduleGen2) with the storyboard -> "what did you get?" (sampleFromHit over bin
// centres). The 4-8-frame tap rule is the data's held_input block. UMD: the pure part runs under node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TidHelperGen2 = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  function platformsFor(D, game) {
    var g = D.gen2.games[game];
    return Object.keys(D.gen2.platforms).filter(function (k) { return g.platform_keys.indexOf(D.gen2.platforms[k].platform_key) !== -1; });
  }
  function context(D, G1, G2, game, platformId, dmgProtocol, state) {
    var g2 = D.gen2, g = g2.games[game], platform = g2.platforms[platformId];
    if (!platform) fail('no gen2 platform ' + platformId);
    var platformKey = platform.family === 'dmg' ? (dmgProtocol === 'dmg-latestart' ? 'dmg-latestart' : 'dmg') : platform.platform_key;
    var meth = G2.methodologyFor(g2, game, platformKey);
    var states = G2.stateIds(g2, game);
    if (states.indexOf(state) === -1) state = g2.defaults.state;
    var resetModel = platform.reset ? D.gen1.reset_models[platform.reset] : null;
    var anchors = platform.anchors.filter(function (a) { return meth.anchors.indexOf(a) !== -1; });
    var sets = G2.targetSetsFor(g2, game, null);
    return { game: game, gameInfo: g, platformId: platformId, platform: platform, family: g2.families[platform.family], platformKey: platformKey, meth: meth, methId: meth.id, timing: meth.timing,
      states: states, state: state, stateRec: g.rtc_dependent ? g2.rtc.states[state] : null, table: G2.tableFor(g2, game, platformKey, state), rule: G2.binRule(g2, game),
      resetModel: resetModel, resetExtraS: resetModel ? G1.resetAnchorExtraSeconds(resetModel) : null, anchors: anchors, sets: sets };
  }
  function hitsAllStates(G2, D, ctx) { return G2.targetsAllStates(D.gen2, ctx.game, ctx.platformKey, ctx.sets); }
  // HOW FAR THE ROUTE-TARGET SETS REACH UNDER THIS METHOD, counted rather than asserted: the hits of the
  // platform key the page is on, and the hits of every platform key the game runs on, each against the number
  // of (RTC state, bin) combinations examined to get them.
  //
  // It exists because "no hits" needed a number and a scope before it could be acted on. The Route targets tab
  // printed one warning line when the list came back empty and stopped there, while section 7 still read "Pick
  // a target to build the cue" - an instruction with nothing on the tab to carry it out. On Crystal that is the
  // whole mode: the game is RTC-immune (gen2.rtc.crystal), so stateIds gives one state, and neither of its two
  // platform keys produces a member of the two sets in force in any of their 599 bins - 0 of 1,198. A runner
  // who opened this mode on Crystal was therefore offered no route to a cue at all and no way to tell whether
  // another console or another clock state would have given one. Neither would. Gold and Silver do have hits,
  // but only on some platform keys (Gold: 1 on gbp, 3 on gbc, 0 on either DMG protocol, all of them in
  // first-boot-only RTC states), so the same empty tab appears there and the per-key counts say where to look.
  function routeReach(D, G2, game, sets) {
    var keys = D.gen2.games[game].platform_keys, states = G2.stateIds(D.gen2, game), per = {}, total = 0;
    keys.forEach(function (pk) { var n = G2.targetsAllStates(D.gen2, game, pk, sets).length; per[pk] = n; total += n; });
    return { keys: keys.slice(), states: states.length, bins: G2.BIN_COUNT, perKey: per, total: total,
      combosPerKey: states.length * G2.BIN_COUNT, combos: keys.length * states.length * G2.BIN_COUNT };
  }
  // HOW MUCH OF THE TID SPACE THIS METHOD ACTUALLY REACHES, read off the inversion tables rather than
  // written down. It matters because the single-press protocol these tables describe is a NARROW slice of
  // what the games can be made to do: the community's own Gen 2 manips are multi-step scripts (a gfwait or
  // movie-end hold, backouts, timed waits, then NEW GAME), and each extra step is another degree of freedom
  // this one does not have. On Crystal that is the difference between about 1,200 reachable Trainer IDs and
  // all 65,536. A user typing an arbitrary TID will therefore miss nearly always, and saying only "not in
  // the table" invites them to conclude they mistimed something when the ID was never reachable this way.
  //
  // The headline figure is SCOPED TO THE ONE TABLE THE PAGE IS AIMING INTO (this platform, this RTC state).
  // That is the only table a single press can land in, and the only one the typed-ID lookup searches
  // (invertTyped passes {platformKey, states: [state]}). It used to be read straight off
  // inversion.games[game].ambiguity.all_distinct_tables, the union over every distinct table of the game,
  // while the sentence around it named one platform and one RTC state: on Gold that printed 23,739 TIDs
  // (36.2%) where the selected table carries 595 (0.9%), so an ID that was never reachable looked about forty
  // times more likely to be on the table than it was. The union is still returned, labelled as a union.
  // distinctTids over the tables in scope is the engine's own count over the shipped bins; run over every
  // table it reproduces the data's precomputed all_distinct_tables exactly (tests/tid-helper/gen2-coverage.test.cjs).
  function coverage(D, G2, game, platformKey, state) {
    var a = G2.ambiguity(D.gen2, game, { platformKey: platformKey, states: [state] });
    var g = D.gen2.inversion && D.gen2.inversion.games ? D.gen2.inversion.games[game] : null;
    var all = g && g.ambiguity ? g.ambiguity.all_distinct_tables : null;
    var hasAll = !!(all && all.distinct_tids);
    // the size of the Trainer ID space comes from the engine (ID_MAX + 1), not from 65536 written out here:
    // it was inlined at two sites, which is two places to be wrong in if it is ever anything else
    var space = G2.ID_MAX + 1;
    return { tids: a.distinctTids, entries: a.entries, tables: a.tables, pct: (a.distinctTids / space) * 100, space: space,
      allTids: hasAll ? all.distinct_tids : null, allTables: hasAll ? all.tables : null,
      allPct: hasAll ? (all.distinct_tids / space) * 100 : null };
  }

  function invertTyped(G2, D, ctx, tid, lid) { return G2.invert(D.gen2, ctx.game, tid, { lid: lid == null ? null : lid, platformKey: ctx.platformKey, states: [ctx.state] }).candidates; }
  function schedule(G2, D, ctx, bin, correctionMs, anchor, beeps, spacingS) {
    return G2.scheduleGen2(D.gen2, ctx.methId, bin, correctionMs, { anchor: anchor, beeps: beeps, spacingS: spacingS, resetExtraS: anchor === 'reset' && ctx.resetExtraS !== null ? ctx.resetExtraS : undefined });
  }
  function fmtLid(l) { return ('00000' + l).slice(-5) + ' ($' + ('000' + l.toString(16).toUpperCase()).slice(-4) + ')'; }
  function submitGot(G1, G2, D, ctx, anchor, cal, lastRun, aimedBin, correction, defaultMs, tidText, lidText, force, fmt, anchorLabel) {
    var tid, lid = null;
    try { tid = G1.parseTid(tidText); if (String(lidText || '').trim() !== '') lid = G1.parseTid(lidText); } catch (e) { return { lines: ['Enter the Trainer ID (and the Lucky ID, if you read it) as decimal (28489) or hex ($6F49 / 0x6F49): ' + (e.message || e) + '.'] }; }
    if (lastRun && (lastRun.platformId !== ctx.platformId || lastRun.methId !== ctx.methId || lastRun.anchor !== anchor || lastRun.state !== ctx.state)) {
      return { lines: ['Not recorded: the last cue (attempt ' + lastRun.attempt + ') was played for ' + lastRun.methId + ' on ' + lastRun.platformId + ', RTC state ' + lastRun.state + ', ' + anchorLabel[lastRun.anchor] + ' anchor, and the page now shows ' + ctx.methId + ' on ' + ctx.platformId + ', RTC state ' + ctx.state + ', ' + anchorLabel[anchor] + ' anchor. Switch back to record that attempt where it belongs, or forget the cue to record under the current choice.'] };
    }
    var aimBin = lastRun ? lastRun.aimed : aimedBin, used = lastRun ? lastRun.correction : correction;
    if (aimBin == null) return { lines: ['Pick a target first: the calibration needs the bin you aimed at.'] };
    var lines = ['You got Trainer ID ' + G1.formatTid(tid) + (lid !== null ? ' with Lucky ID ' + fmtLid(lid) : '') + ': ' + G2.verdictText(tid, lid, null, ctx.sets) + '.'];
    var res;
    try { res = G2.sampleFromHit(D.gen2, ctx.game, ctx.platformKey, ctx.gameInfo.rtc_dependent ? ctx.state : null, tid, lid, aimBin, used, { attempt: lastRun ? lastRun.attempt : null, note: '', player: 'app' }); }
    catch (e) { lines.push(e.message || String(e)); return { lines: lines }; }
    if (!res.sample) {
      lines.push('Those IDs are not in the ' + ctx.platform.name + ' table for RTC state ' + ctx.state + ' (' + ctx.methId + '), so nothing can be learned from them. Usual causes: START held outside the window, the save was not cleared (a CONTINUE menu), a tap longer than 8 frames or START still down at the roll, a different console family' + (ctx.platform.family === 'dmg' ? ' or the other DMG protocol' : '') + ', or the tap was later than the table\'s last bin. Correction unchanged.');
      if (ctx.gameInfo.rtc_dependent) {
        var wider = G2.invert(D.gen2, ctx.game, tid, { lid: lid, platformKey: ctx.platformKey });
        if (wider.candidates.length) lines.push('They do appear in other RTC states of this console: ' + wider.candidates.map(function (c) { return c.members.map(function (m) { return m[1]; }).join('=') + ' bin ' + c.bin + (c.reachableAfterFirstBoot ? '' : ' (first boot only)'); }).join('; ') + '. If the cartridge really was in one of those states, pick it and record again.');
      }
      return { lines: lines };
    }
    var sample = res.sample, hit = sample.hit_bin;
    if (res.candidateBins.length > 1) lines.push('(Those IDs come from bins ' + res.candidateBins.join(', ') + '; using ' + hit + ', the one nearest your aim.)');
    var err = G2.errorFramesBins(ctx.rule, hit, aimBin);
    lines.push(err === 0 ? 'You hit bin ' + hit + ' exactly (aimed ' + aimBin + ').' : 'You hit bin ' + hit + ', aimed ' + aimBin + ': ' + Math.abs(err) + ' frames between the bin centres, ' + (err > 0 ? 'late' : 'early') + ' (' + fmt.ms(Math.abs(G1.framesToMs(err))) + ').');
    lines.push('Implied correction: ' + fmt.ms(used) + ' used ' + (err >= 0 ? '+' : '-') + ' ' + fmt.ms(Math.abs(G1.framesToMs(err))) + ' = ' + fmt.ms(sample.implied_ms) + '.');
    if (!force && G2.isOutlierBins(ctx.rule, hit, aimBin)) { lines.push('That is more than ' + G2.OUTLIER_FRAMES + ' frames (' + G2.OUTLIER_FRAMES / G2.POLL_PERIOD_FRAMES + ' bins, ' + G1.framesToSeconds(G2.OUTLIER_FRAMES).toFixed(1) + ' s) from the aim: NOT added to the calibration. Usual causes: START held outside the window, a mistyped ID, or the IDs of a different attempt. If it really was this attempt, add it anyway.'); return { lines: lines, forceable: true }; }
    if (!force && G1.isDuplicate(cal.samples, sample)) { lines.push('These IDs were already entered for the same aim (the same attempt twice?): not added. If it really is a new attempt, add it anyway.'); return { lines: lines, forceable: true }; }
    var next = cal.samples.concat([sample]), kept = G1.splitByMethodology(next, ctx.methId).kept, m = G1.meanCorrection(kept, defaultMs);
    lines.push('Recorded: ' + kept.length + ' sample' + (kept.length === 1 ? '' : 's') + ' on ' + ctx.platformId + ', ' + anchorLabel[anchor] + ' anchor, under ' + ctx.methId + '. Correction in force is now ' + fmt.ms(m) + (cal.override != null ? ' (the mean; your override of ' + fmt.ms(cal.override) + ' is still in force until you clear it).' : '.'));
    return { lines: lines, recorded: true, samples: next };
  }
  var pure = { coverage: coverage, platformsFor: platformsFor, context: context, hitsAllStates: hitsAllStates, routeReach: routeReach, invertTyped: invertTyped, schedule: schedule, submitGot: submitGot, fmtLid: fmtLid };

  // ---- UI -------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'gen2', fmt = { s: A.fmtS, ms: A.fmtMs };
    var ANCHOR_LABEL = { menu: 'menu', poweron: 'power-on', reset: 'reset' };
    var ANCHOR_BUTTON = { menu: 'the NEW GAME / OPTION box', poweron: 'power-on', reset: 'the reset press' };
    var state = { lastRun: null };
    function p(k, d) { return A.pref(SEC, k, d); }
    function ctxFor(game) {
      var g2 = A.D.gen2, ids = platformsFor(A.D, game), pid = p('platform', g2.defaults.platform);
      if (ids.indexOf(pid) === -1) pid = ids.indexOf(g2.defaults.platform) !== -1 ? g2.defaults.platform : ids[0];
      var ctx = context(A.D, A.G1, A.G2, game, pid, p('dmgProtocol', 'dmg'), p('state', g2.defaults.state));
      var anchor = p('anchor', 'menu'); if (ctx.anchors.indexOf(anchor) === -1) anchor = ctx.anchors[0];
      ctx.anchor = anchor; ctx.calKey = 'gen2.' + pid + '.' + anchor; ctx.defaultMs = g2.defaults.correction_ms[anchor] == null ? 100 : g2.defaults.correction_ms[anchor];
      var cal = A.cal(ctx.calKey), mine = A.G1.splitByMethodology(cal.samples, ctx.methId).kept;
      ctx.correction = cal.override != null ? cal.override : A.G1.meanCorrection(mine, ctx.defaultMs);
      ctx.beeps = Number(p('beeps', g2.defaults.count_in_beeps)) || 0; ctx.spacing = g2.defaults.count_in_spacing_s;
      var aimedBin = p('aimed', null); ctx.aimed = null;
      if (typeof aimedBin === 'number' && aimedBin >= 0 && aimedBin < A.G2.BIN_COUNT) { var l = A.G2.lookup(g2, game, ctx.platformKey, ctx.state, aimedBin); ctx.aimed = { bin: aimedBin, tid: l.tid, lid: l.lid, sid: l.sid, offsets: l.offsets }; }
      // the route targets are read here, not only inside the target tab, because section 7 has to know whether
      // there is anything to pick before it tells the runner to pick something
      ctx.hits = hitsAllStates(A.G2, A.D, ctx);
      // the sweep over every platform key of the game costs a table decode per key, so it runs only in the case
      // that needs it: when this platform key has no hits and the runner has to be told whether another would
      ctx.reach = ctx.hits.length ? null : routeReach(A.D, A.G2, ctx.game, ctx.sets);
      ctx.sched = null; ctx.schedError = null;
      if (ctx.aimed) { try { ctx.sched = schedule(A.G2, A.D, ctx, ctx.aimed.bin, ctx.correction, anchor, ctx.beeps, ctx.spacing); } catch (e) { ctx.schedError = A.errMsg(e); } }
      return ctx;
    }
    // the one table this page can aim into, named the way the rest of the page names it (Crystal is RTC-immune)
    function scopeLabel(ctx) { return 'the ' + esc(ctx.platform.name) + ' table' + (ctx.gameInfo.rtc_dependent ? ' for RTC state ' + esc(ctx.state) : ''); }
    function rowHtml(ctx, r) {
      return '<tr' + (ctx.aimed && ctx.aimed.bin === r.bin && r.state === ctx.state ? ' class="sel"' : '') + '><td>' + esc(r.state) + (r.reachable === false || r.reachableAfterFirstBoot === false ? ' <span class="small warn">(first boot only)</span>' : '') + '</td><td>' + r.bin + '</td><td>' + r.offsets[0] + '-' + r.offsets[1] + '</td><td class="mono">' + esc(A.fmtTid(r.tid)) + '</td><td class="mono">' + esc(fmtLid(r.lid)) + '</td>' + (r.sid != null ? '<td class="mono">' + esc(A.hex4(r.sid)) + '</td>' : '') + '<td><button type="button" class="secondary small" data-g2-aim="' + r.bin + '" data-g2-state="' + esc(r.state) + '">aim</button></td></tr>';
    }
    // the Prescribed sequence mode's own coverage figure for this game, or null where that mode does not serve it
    function psrPercent(ctx) {
      var g = A.D.gen2psr && A.D.gen2psr.games ? A.D.gen2psr.games[ctx.game] : null;
      return g && g.gbp && g.gbp.coverage ? g.gbp.coverage.percent : null;
    }
    // WHAT AN EMPTY ROUTE-TARGET TAB SAYS. It used to be one line - "No (RTC state, bin) of this platform
    // produces a member of the sets in force under the single-tap methodology" - with no count behind it, no
    // statement of whether another platform would do better, and no route onward, while section 7 went on
    // asking for a target. On Crystal, where nothing is reachable on either platform key, that left the mode
    // with no way to a cue at all. Every number here is measured off the shipped tables at render time.
    function emptyTargetsHtml(ctx) {
      var r = ctx.reach, cov = coverage(A.D, A.G2, ctx.game, ctx.platformKey, ctx.state), pct = psrPercent(ctx);
      var others = r.keys.filter(function (k) { return k !== ctx.platformKey && r.perKey[k] > 0; });
      var h = '<p class="warn">No (RTC state, bin) of this platform produces a member of the sets in force under the single-tap methodology: 0 of the ' +
        // the count is per platform KEY, and a platform can carry two of them (the DMG runs both dmg and
        // dmg-latestart), so naming the platform here attributed one key's zero to both protocols
        r.combosPerKey.toLocaleString() + ' combinations on ' + esc(A.D.gen2.platform_keys[ctx.platformKey] ? A.D.gen2.platform_keys[ctx.platformKey].name : ctx.platformKey) + ' (' + r.states + ' RTC state' + (r.states === 1 ? '' : 's') + ' x ' + r.bins + ' bins). ' +
        (r.total === 0
          ? 'Nor does any other console: 0 of the ' + r.combos.toLocaleString() + ' over all ' + r.keys.length + ' platform keys ' + esc(ctx.gameInfo.name) + ' runs on, so no platform or RTC state offered above reaches one.'
          : 'Other platform keys of this game do: ' + others.map(function (k) { return esc(A.D.gen2.platform_keys[k].name) + ' (' + r.perKey[k] + ')'; }).join(', ') + '. Pick one above if that is the console the cartridge was in.') + '</p>';
      h += '<p class="small muted">' +
        // .every() is true of an empty list, so with no sets in force this used to assert a fact about sets
        // that were not there
        (ctx.sets.length && ctx.sets.every(function (s) { return s.protocol === 'community-script'; }) ? 'Every set in force is published for a community multi-step script rather than for this single tap, which is what their notes above say. ' : '') +
        'There is nothing on this tab to pick, so no cue can be built from it. Instead: open <b>Typed IDs</b>, type a Trainer ID that ' + scopeLabel(ctx) + ' carries - it holds ' + cov.tids.toLocaleString() + ' of the ' + cov.space.toLocaleString() + ' - and press aim on the bin the lookup names; that bin builds the cue.' +
        (pct !== null ? ' For an ID this table does not carry, the <b>Prescribed sequence</b> method on the method list reaches ' + pct + '% of all ' + cov.space.toLocaleString() + ' Trainer IDs on a Game Boy Player.' : '') + '</p>';
      return h + '<p><button type="button" class="secondary small" data-g2-mode="tid">Open Typed IDs</button></p>';
    }
    function targetsHtml(ctx) {
      var mode = p('targetMode', 'set'), hasSid = ctx.gameInfo.ids.indexOf('sid') !== -1;
      var h = '<div class="tabs"><button type="button" class="tab' + (mode === 'set' ? ' active' : '') + '" data-g2-mode="set">Route targets</button><button type="button" class="tab' + (mode === 'tid' ? ' active' : '') + '" data-g2-mode="tid">Typed IDs</button></div>';
      var head = '<tr><th>RTC state</th><th>bin</th><th>offsets</th><th>TID</th><th>Lucky ID</th>' + (hasSid ? '<th>SID</th>' : '') + '<th></th></tr>';
      if (mode === 'set') {
        h += '<p class="small muted">Target sets in force: ' + ctx.sets.map(function (s) { return esc(A.G2.setDescribe(s)); }).join('; ') + '.</p>';
        ctx.sets.forEach(function (s) { if (s.note) h += '<p class="small muted">' + esc(s.key) + ': ' + esc(s.note) + '</p>'; });
        h += ctx.hits.length ? '<table class="tbl">' + head + ctx.hits.map(function (r) { return rowHtml(ctx, r); }).join('') + '</table>' : emptyTargetsHtml(ctx);
      } else {
        var cov = coverage(A.D, A.G2, ctx.game, ctx.platformKey, ctx.state);
        // the method's own name, not a paraphrase of one of them: this read "hold START from power-on" on every
        // platform, which is the wrong protocol on the DMG late-start one, where the data says "press START
        // during the copyright text"
        h += '<p class="small muted">This method - ' + esc(ctx.meth.name) + ' - reaches <b>' +
          cov.tids.toLocaleString() + '</b> of the ' + cov.space.toLocaleString() + ' Trainer IDs (' + cov.pct.toFixed(1) + '%) on ' + esc(ctx.gameInfo.name) + ' in ' + scopeLabel(ctx) + ': the ' + cov.entries + ' bins a press can land in. ' +
          'It is one press from one hold, so most IDs are simply not on it. ' +
          (cov.allTids ? 'The ' + cov.allTables + ' distinct tables of this game, over every platform and RTC state, reach ' + cov.allTids.toLocaleString() + ' (' + cov.allPct.toFixed(1) + '%) between them, but a press can only land in the one the cartridge and console are actually in. ' : '') +
          'The community\'s Gen 2 manips are multi-step scripts - a gfwait or movie-end hold, backouts, timed waits, then NEW GAME - and those reach IDs this cannot. ' +
          ((A.D.gen2psr && A.D.gen2psr.games && A.D.gen2psr.games[ctx.game])
            ? 'This helper now has one: pick <b>Prescribed sequence</b> from the method list. Buffered backouts, a measured wait and the NEW GAME press held out instead of tapped reach ' + A.D.gen2psr.games[ctx.game].gbp.coverage.percent + '% of all ' + cov.space.toLocaleString() + ' Trainer IDs on a Game Boy Player.'
            : 'If the ID you want is not here, that is the reason, and their scripts are where to get it.') + '</p>';
        h += '<div class="row"><label class="field">Trainer ID<input type="text" id="g2-tid" value="' + esc(p('tid', '')) + '" placeholder="28489 or $6F49"></label><label class="field">Lucky ID (optional)<input type="text" id="g2-lid" value="' + esc(p('lid', '')) + '" placeholder="01001 or $03E9"></label></div><div id="g2-tid-result">' + tidResultHtml(ctx) + '</div>';
      }
      if (ctx.aimed) h += '<p class="aim">Aim: bin <b>' + ctx.aimed.bin + '</b> (offsets ' + ctx.aimed.offsets[0] + '-' + ctx.aimed.offsets[1] + ') in RTC state ' + esc(ctx.state) + ' -> TID ' + esc(A.fmtTid(ctx.aimed.tid)) + ', Lucky ID ' + esc(fmtLid(ctx.aimed.lid)) + (ctx.aimed.sid != null ? ', SID $' + A.hex4(ctx.aimed.sid) : '') + '.</p>';
      return h;
    }
    function tidResultHtml(ctx) {
      var t = String(p('tid', '')).trim(), l = String(p('lid', '')).trim(); if (!t) return '';
      var tid, lid = null; try { tid = A.G1.parseTid(t); if (l) lid = A.G1.parseTid(l); } catch (e) { return '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      var cands = invertTyped(A.G2, A.D, ctx, tid, lid), hasSid = ctx.gameInfo.ids.indexOf('sid') !== -1;
      var h = '<p>' + esc(A.fmtTid(tid)) + (lid !== null ? ' + Lucky ID ' + esc(fmtLid(lid)) : '') + ': ' + esc(A.G2.verdictText(tid, lid, null, ctx.sets)) + '.</p>' + A.sourcesHtml(ctx.game, tid, 'derived');
      if (!cands.length) {
        var c2 = coverage(A.D, A.G2, ctx.game, ctx.platformKey, ctx.state);
        return h + '<p class="warn">Not in ' + scopeLabel(ctx) + ' (' + esc(ctx.methId) + ').</p>' +
          '<p class="small muted">Most likely nothing you did: that table is ' + c2.entries + ' bins carrying ' + c2.tids.toLocaleString() +
            ' of the ' + c2.space.toLocaleString() + ' Trainer IDs (' + c2.pct.toFixed(1) + '%), so an ID picked in advance is almost never on it. ' +
            (c2.allTids ? 'The ' + c2.allTables + ' distinct tables of this game, over every platform and RTC state, reach ' + c2.allTids.toLocaleString() + ' (' + c2.allPct.toFixed(1) + '%) between them, but a press can only land in the one the cartridge and console are actually in. ' : '') +
            'Reaching an arbitrary ID needs the community\'s multi-step scripts, which this tool does not implement. ' +
            'Also note a buffered or held-out A press is longer than the 4-8 frame tap these tables are indexed by, so it lands outside them entirely.</p>';
      }
      return h + '<table class="tbl"><tr><th>RTC state</th><th>bin</th><th>offsets</th><th>TID</th><th>Lucky ID</th>' + (hasSid ? '<th>SID</th>' : '') + '<th></th></tr>' + cands.map(function (c) { return rowHtml(ctx, { state: ctx.state, bin: c.bin, offsets: c.offsets, tid: c.tid, lid: c.lid, sid: c.sid, reachable: c.reachableAfterFirstBoot }); }).join('') + '</table>';
    }
    function program(ctx) {
      var s = ctx.sched, tA = s.tA;
      return { cues: s.cues, visuals: A.Cue.visualsFor(s.cues, A.Cue.A_TAP_S), endT: tA + s.rollSettleS + 0.5, label: ctx.methId + ' bin ' + ctx.aimed.bin + ' (' + ANCHOR_LABEL[ctx.anchor] + ' anchor)',
        clock: function (t) { return t < tA ? 'A in ' + (tA - t).toFixed(2) + ' s' : t < tA + s.rollSettleS ? 'tap A, then nothing' : 'done'; } };
    }
    function protocolHtml(ctx) {
      var g2 = A.D.gen2, s = ctx.sched, lines = [];
      lines.push('Platform rule: ' + ctx.family.start_rule);
      if (ctx.gameInfo.rtc_dependent) lines.push('RTC: ' + (ctx.stateRec ? 'state ' + ctx.state + ' = ' + ctx.stateRec.label + ' (' + ctx.stateRec.why + ')' : ctx.state) + '.');
      else lines.push('RTC: ' + g2.rtc.crystal);
      lines.push('Tap rule: ' + g2.held_input.rule);
      lines.push('Window: ' + g2.held_input.window + '.');
      // Say how many count-in beeps will actually SOUND. countInCues drops a beep whenever it would fall before
      // the count-in floor - the anchor itself on the menu anchor, the menu plus COUNT_IN_CLEAR_S on power-on
      // and reset - and this line used to print ctx.beeps, the number typed in the box above, beside a
      // parenthetical naming the drops. At this page's defaults (4 beeps, 1.0 s spacing, the data's
      // corrections) 1,479 of the 13,734 buildable schedules drop at least one beep and 449 drop all four, so
      // gold/gbp/hold-start-v1 bin 3 on the menu anchor promised "4 count-in beeps then the long high beep at
      // 0.043 s" over a program that held the A tone alone. page-gen1-timed.js prints beeps - droppedCountIn in
      // both of its branches for the same reason.
      if (s) {
        var dropped = s.droppedCountIn, played = ctx.beeps - dropped;
        var why = (dropped === 1 ? 'it would have been due ' : 'they would have been due ') + (ctx.anchor === 'menu' ? 'before your tap on the box' : 'before the menu');
        // Losing EVERY beep is not a shorter count-in, it is no count-in: the program becomes one tone, and the
        // press it marks still has to be frame-exact. Printing "0 count-in beeps" would leave the runner waiting
        // for a rhythm that never starts, so this case says so outright and points at the preview.
        var tail = dropped === 0 ? ''
          : played === 0 ? ' No count-in at all: all ' + ctx.beeps + ' beep' + (ctx.beeps === 1 ? ' was' : 's were') + ' left out because ' + why + '. The long high beep is the whole cue, so there is nothing to count into and no run-up to the tap. Preview it before you run it.'
          : ' (' + dropped + ' count-in beep' + (dropped === 1 ? '' : 's') + ' left out: ' + why + '.)';
        lines.push('Cue: ' + (played === 0 ? 'the long high beep alone, at ' + A.fmtS(s.tA) : played + ' count-in beep' + (played === 1 ? '' : 's') + ' then the long high beep at ' + A.fmtS(s.tA)) + ' after the anchor; the bin accepts an A that goes down ' + A.fmtS(s.aWindow[0]) + '-' + A.fmtS(s.aWindow[1]) + ' after ' + (ctx.anchor === 'menu' ? 'the visible box' : 'the anchor') + '; tap for ' + s.tapMs[0].toFixed(0) + '-' + s.tapMs[1].toFixed(0) + ' ms and press nothing for ' + s.rollSettleS + ' s. The beep is ' + A.fmtMs(ctx.correction) + ' early (the correction).' + tail);
      }
      lines.push('Afterwards type the Trainer ID (and the Lucky ID from the Radio Tower lottery screen, if you read it) below.');
      return A.list(lines.map(esc)) + A.details('The methodology\'s own protocol text', '<p class="small">' + esc(ctx.meth.protocol) + '</p>');
    }
    function statusHtml(ctx) {
      var m = ctx.meth;
      return A.statusBlock([
        ['Methodology', ctx.methId + ' (v' + m.version + ', ' + m.date + '): ' + m.name], ['Status', m.status], ['Predicts', m.predicts],
        ['Platform', ctx.platform.name + ' (' + ctx.platformId + ', ' + ctx.platformKey + ')'], ['Platform status', ctx.platform.status], ['This platform', ctx.platform.validation],
        ['Console family', m.console_name], ['Hardware validation (family)', ctx.family.hardware_validation], ['Validation', m.validation || null],
        ['Validity', A.VALID_ONLY], ['Anchor', A.D.gen2.anchor_names[ctx.anchor]], ['Scenes', A.D.scenes.status]
      ]) + A.details('Validity conditions (' + m.validity.length + ')', '<ol class="plain">' + m.validity.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ol>') +
        A.details('Lucky ID conditions', '<p class="small">' + esc(A.D.gen2.lid_rules.summary) + '</p><ol class="plain">' + A.D.gen2.lid_rules.conditions.map(function (c) { return '<li>' + esc(c.text) + '</li>'; }).join('') + '</ol>');
    }
    // THE CUE CARD'S FALLBACK IS AN INSTRUCTION, so it has to name somewhere the runner can carry it out. It
    // read "Pick a target to build the cue" whenever no bin was aimed, including when the Route targets tab it
    // was pointing at had nothing on it to pick - which on Crystal is always. That sentence is how the missing
    // Crystal cue stayed unnoticed: the page looked like it was waiting for the runner rather than like it had
    // nothing to offer, and following it led back to an empty tab.
    function noTargetHtml(ctx) {
      // which tab is open matters. This sentence names the Route targets tab as the reason there is no cue,
      // which is only true while that tab is the one on screen: a runner on Typed IDs who has not yet entered
      // an ID was being told about a tab they had already left. That is the same defect this whole branch
      // exists to fix - an instruction that does not match where the reader is standing.
      if (p('targetMode', 'set') !== 'set') return '<p class="muted">Enter a Trainer ID in section 3 and press aim on the bin the lookup names: the cue is built from that bin.</p>';
      if (ctx.hits.length) return '<p class="muted">Pick a target to build the cue.</p>';
      var where = ctx.reach && ctx.reach.total === 0
        ? esc(ctx.gameInfo.name) + ' under this methodology, on any of the ' + ctx.reach.keys.length + ' platform keys it runs on'
        : esc(ctx.platform.name) + ' under this methodology';
      return '<p class="muted">No cue can be built from the Route targets tab: no route target is reachable on ' + where + '. Open <b>Typed IDs</b> instead, type a Trainer ID ' + scopeLabel(ctx) + ' carries, and press aim on the bin the lookup names: the cue is built from that bin.</p>';
    }
    function render(el, game) {
      var ctx = ctxFor(game), g2 = A.D.gen2;
      var h = '<h2>Timed tap method: ' + esc(g2.games[game].name) + '</h2>';
      h += A.card('<h3>1. Platform</h3>' + A.choices('g2-platform', platformsFor(A.D, game).map(function (k) { var pl = g2.platforms[k]; return { id: k, title: pl.name, sub: pl.status + ' - ' + pl.validation }; }), ctx.platformId) +
        (ctx.platform.family === 'dmg' ? '<p class="small">DMG protocol:</p>' + A.choices('g2-dmg', ['dmg', 'dmg-latestart'].filter(function (k) { return ctx.gameInfo.platform_keys.indexOf(k) !== -1; }).map(function (k) { return { id: k, title: g2.platform_keys[k].name, sub: g2.platform_keys[k].protocol }; }), ctx.platformKey) : '') +
        '<p class="small muted">Methodology: <span class="mono">' + esc(ctx.methId) + '</span>. ' + esc(A.VALID_ONLY) + '</p>');
      h += A.card('<h3>2. RTC state</h3>' + (ctx.gameInfo.rtc_dependent ? A.select('g2-state', ctx.states.map(function (s) { var r = g2.rtc.states[s]; return { id: s, title: s + ': ' + r.label + (r.reachable_after_first_boot ? '' : ' (first boot only)') }; }), ctx.state, 'Day bracket of the cartridge clock') + '<p class="small muted">' + esc(ctx.stateRec ? ctx.stateRec.why : '') + '</p>' : '<p class="small muted">' + esc(g2.rtc.crystal) + '</p>'));
      h += A.card('<h3>3. Anchor</h3>' + A.choices('g2-anchor', ctx.anchors.map(function (a) { return { id: a, title: ANCHOR_LABEL[a], sub: g2.anchor_names[a] }; }), ctx.anchor) + '<label class="field">Count-in beeps<input type="number" min="0" max="9" id="g2-beeps" value="' + ctx.beeps + '"></label>');
      h += A.card('<h3>4. Target</h3>' + targetsHtml(ctx));
      h += A.card('<h3>5. Correction and calibration</h3>' + A.widgets.calibrationHtml('g2-cal', ctx.calKey, ctx.methId, ctx.defaultMs, A.G2.POLL_PERIOD_FRAMES * A.G1.FRAME_MS, 'After an attempt, type the Trainer ID (and Lucky ID) you got; the engine finds the bin, measures the miss in frames between bin centres and updates the correction.', 'a ' + A.G2.POLL_PERIOD_FRAMES + '-frame poll bin'));
      h += A.card('<h3>6. Protocol</h3>' + protocolHtml(ctx));
      h += A.card('<h3>7. Cue and storyboard</h3>' + (ctx.schedError ? '<p class="bad">' + esc(ctx.schedError) + '</p>' : ctx.sched ? A.widgets.storyWidgetHtml('g2-story', ANCHOR_BUTTON[ctx.anchor], null) : noTargetHtml(ctx)) +
        A.toolsHtml(['flowtimer'], 'This count-in and long beep is what the speedrunning community plays with FlowTimer for the Gold/Silver/Crystal manips, and the correction plays the part of its offset:'));
      h += A.sourcesCard(game);
      h += A.card('<h3>Status (from the data)</h3>' + statusHtml(ctx));
      el.innerHTML = h;
      var lidEl = A.$('g2-cal-extra'); if (lidEl) lidEl.innerHTML = '<label class="field">Lucky ID you got (optional)<input type="text" id="g2-cal-lid" placeholder="01001"></label>';
      A.widgets.bindCalibration('g2-cal', { key: ctx.calKey, methId: ctx.methId, defaultMs: ctx.defaultMs, onChange: function () { A.render(); },
        submit: function (text, force) {
          var cal = A.cal(ctx.calKey), lidText = A.$('g2-cal-lid') ? A.$('g2-cal-lid').value : '';
          var res = submitGot(A.G1, A.G2, A.D, ctx, ctx.anchor, cal, state.lastRun, ctx.aimed ? ctx.aimed.bin : null, ctx.correction, ctx.defaultMs, text, lidText, force, fmt, ANCHOR_LABEL);
          if (res.recorded) { A.setCal(ctx.calKey, { samples: res.samples, override: cal.override }); state.lastRun = null; }
          return res;
        } });
      if (ctx.sched) A.widgets.mountStory({ id: 'g2-story', gameName: game,
        timeline: function () { return A.Story.gen2Timeline(A.D, A.G2, ctx.methId, ctx.aimed.bin, ctx.anchor, ctx.anchor === 'reset' ? ctx.resetExtraS : 0, ctx.state); },
        program: function () { return program(ctx); },
        onStart: function (mode) { if (mode === 'run') state.lastRun = { attempt: 'app-' + Date.now().toString(36), aimed: ctx.aimed.bin, tid: ctx.aimed.tid, lid: ctx.aimed.lid, correction: ctx.correction, anchor: ctx.anchor, methId: ctx.methId, platformId: ctx.platformId, state: ctx.state }; } });
    }
    function onEvent(ev, game) {
      var t = ev.target;
      if (ev.type === 'click') {
        var c = t.closest('[data-choice]');
        if (c) { var n = c.getAttribute('data-choice'), id = c.getAttribute('data-id'); if (n === 'g2-platform') A.setPref(SEC, { platform: id, aimed: undefined }); else if (n === 'g2-dmg') A.setPref(SEC, { dmgProtocol: id, aimed: undefined }); else if (n === 'g2-anchor') A.setPref(SEC, { anchor: id }); else return null; return 'render'; }
        var m = t.closest('[data-g2-mode]'); if (m) { A.setPref(SEC, { targetMode: m.getAttribute('data-g2-mode') }); return 'render'; }
        var a = t.closest('[data-g2-aim]'); if (a) { A.setPref(SEC, { aimed: Number(a.getAttribute('data-g2-aim')), state: a.getAttribute('data-g2-state') }); return 'render'; }
      } else {
        if (t.id === 'g2-tid') { A.setPref(SEC, { tid: t.value }); var r = A.$('g2-tid-result'); if (r) r.innerHTML = tidResultHtml(ctxFor(game)); }
        else if (t.id === 'g2-lid') { A.setPref(SEC, { lid: t.value }); var r2 = A.$('g2-tid-result'); if (r2) r2.innerHTML = tidResultHtml(ctxFor(game)); }
        else if (t.id === 'g2-state') { A.setPref(SEC, { state: t.value, aimed: undefined }); return 'render'; }
        else if (t.id === 'g2-beeps') { A.setPref(SEC, { beeps: Number(t.value) }); return 'render'; }
      }
      return null;
    }
    A.registerMode({ id: 'gen2', title: 'Timed tap method', games: ['gold', 'silver', 'crystal'], render: render, onEvent: onEvent,
      line: function (game) { return ctxFor(game).meth.status; }, sub: function (game) { return ctxFor(game).methId; } });
  }
  return pure;
});
