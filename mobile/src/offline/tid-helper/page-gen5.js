// TID Helper page: Gen 5 (Black / White / Black 2 / White 2).
//
// WHY THIS ONE CANNOT ANSWER A STRANGER. Every other mode in this app gives the same answer to everybody:
// the route to Crystal 28489 is the route to Crystal 28489. Gen 5 is not like that. The game seeds its RNG
// ONCE at boot, from a SHA-1 over a message containing the console's MAC ADDRESS and three timing constants
// (Timer0, VCount, VFrame) that belong to that console and that cartridge together. Two people booting the
// same game on the same second get different Trainer IDs.
//
// So the first thing this mode needs is a PROFILE, and a profile cannot be looked up - it has to be found,
// by telling the app a Trainer ID you actually got and roughly when you booted. Until then every number
// here is melonDS's defaults, which are right for an emulator and wrong for any real DS. The page says so
// rather than printing confident numbers over an uncalibrated profile.
//
// There is also no delay. Gen 5 seeds at boot and never again, so a target is a SECOND and a set of buttons
// held, not a frame count. Nothing to hit late.
//
// WHAT THIS PROJECT DID. It derived nothing: gen5.js is a transcription of PokeFinder's boot-seed message,
// nazo tables and ID advance counts. The fixed vector in gen5-tid.json is asserted in the test suite. No
// hardware sample has been taken and no real console has been calibrated here.
//
// UMD: the pure layer runs under node so the tests can drive it without a DOM. BigInt is required (the
// Gen 5 LCRNG is 64-bit); every WebView this ships to has it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('../../../../src/lib/shiny/gen5.js'));
  else root.TidHelperGen5 = factory(root, root.ShinyGen5);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root, G5) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  function model(D) { if (!D || !D.gen5) fail('gen5-tid.json is not loaded'); return D.gen5; }
  function game(D, key) { var g = model(D).games[key]; if (!g) fail('no gen5 game ' + key); return g; }

  // 48 bits, however it was typed: 00:09:BF:11:22:33, 0009BF112233, with dashes, with spaces.
  function parseMac(s) {
    var hex = String(s == null ? '' : s).replace(/[^0-9a-fA-F]/g, '');
    if (hex.length !== 12) return null;
    return BigInt('0x' + hex);
  }
  function profileFrom(D, key, o) {
    var d = model(D).defaults, mac = parseMac(o.mac);
    if (mac === null) fail('the MAC address needs 12 hex digits; a DS shows it under Settings - Internet - Options - System Information');
    var t0min = Number(o.timer0Min), t0max = Number(o.timer0Max);
    if (!(t0min >= 0 && t0max >= t0min)) fail('the Timer0 range is backwards');
    return {
      game: key, language: o.language || d.language, dsType: o.dsType || d.ds_type, mac: mac,
      vframe: Number(o.vframe), gxstat: Number(o.gxstat), vcount: Number(o.vcount),
      timer0Min: t0min, timer0Max: t0max,
      keypresses: [true, false, false, false, false, false, false, false, false]
    };
  }
  // one boot: the seed, how many advances before the ID draw, and the first few ID rows
  function bootRows(prof, t, timer0, rows) {
    var seed = G5.initialSeed({
      game: prof.game, language: prof.language, dsType: prof.dsType, mac: prof.mac,
      vframe: prof.vframe, gxstat: prof.gxstat, timer0: timer0, vcount: prof.vcount,
      year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second
    });
    return { seed: seed, base: G5.initialAdvancesID(seed, prof.game), rows: G5.idRows(seed, prof.game, 0, rows == null ? 3 : rows) };
  }
  // every boot second in one clock minute that reaches `tid`
  function targets(D, prof, tid, sid, t, limit, maxAdvances) {
    if (!(Number.isInteger(tid) && tid >= 0 && tid <= 0xFFFF)) fail('Trainer ID must be 0..65535');
    var d = model(D).defaults;
    var hits = G5.searchTid(prof, t.year, t.month, t.day, t.hour, t.minute, 0, 59, tid,
                            sid == null ? null : sid, maxAdvances == null ? d.max_advances : maxAdvances,
                            limit == null ? d.search_limit : limit);
    for (var i = 0; i < hits.length; i++) if (hits[i].tid !== tid) fail('gen5: a row claims ' + tid + ' but holds ' + hits[i].tid);
    return hits;
  }
  // buttonNames() returns a STRING, not an array. The site's React tab calls .join('+') on it, which would
  // throw for any non-empty mask and survives only because it hardcodes "no buttons". Do not repeat that.
  function buttonsText(mask) { var s = G5.buttonNames(mask); return typeof s === 'string' ? s : String(s); }

  // ---- calibration ----------------------------------------------------------------------------------
  // profileSearch() walks vframe x gxstat x timer0 x vcount x second with NO early exit, and every cell is
  // a SHA-1 plus several 64-bit LCRNG steps. The defaults on the site are five million cells - about 42 s on
  // a desktop and minutes in a phone WebView, with no progress and no cancel. So the cost is computed and
  // stated FIRST, and a range that would wedge the page is refused rather than started.
  var CAL_CELL_BUDGET = 400000;
  function calCost(c) {
    var vf = c.vframeMax - c.vframeMin + 1, t0 = c.timer0Max - c.timer0Min + 1;
    var vc = c.vcountMax - c.vcountMin + 1, sec = c.secondMax - c.secondMin + 1;
    if (!(vf > 0 && t0 > 0 && vc > 0 && sec > 0)) fail('a calibration range is backwards');
    return { cells: vf * t0 * vc * sec, vframes: vf, timer0s: t0, vcounts: vc, seconds: sec, budget: CAL_CELL_BUDGET };
  }
  function calibrate(D, prof, tid, sid, t, c) {
    var cost = calCost(c);
    if (cost.cells > CAL_CELL_BUDGET)
      fail('that range is ' + cost.cells.toLocaleString() + ' boots to hash, which would lock the page up. '
         + 'Narrow Timer0, VCount, VFrame or the second range to at most ' + CAL_CELL_BUDGET.toLocaleString() + '.');
    var rows = G5.profileSearch({
      game: prof.game, language: prof.language, dsType: prof.dsType, mac: prof.mac, buttons: 0,
      year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute,
      minSecond: c.secondMin, maxSecond: c.secondMax,
      minVCount: c.vcountMin, maxVCount: c.vcountMax,
      minTimer0: c.timer0Min, maxTimer0: c.timer0Max,
      minGxStat: prof.gxstat, maxGxStat: prof.gxstat,
      minVFrame: c.vframeMin, maxVFrame: c.vframeMax
    }, function (seed) {
      var rs = G5.idRows(seed, prof.game, 0, 3);
      for (var i = 0; i < rs.length; i++) if (rs[i].tid === tid && (sid == null || rs[i].sid === sid)) return true;
      return false;
    });
    return rows.map(function (r) {
      var rs = G5.idRows(r.seed, prof.game, 0, 3), row = -1;
      for (var i = 0; i < rs.length; i++) if (rs[i].tid === tid && (sid == null || rs[i].sid === sid)) { row = i; break; }
      return { timer0: r.timer0, vcount: r.vcount, vframe: r.vframe, gxstat: r.gxstat, second: r.second, row: row, seed: r.seed };
    });
  }

  var pure = { model: model, game: game, parseMac: parseMac, profileFrom: profileFrom, bootRows: bootRows,
               targets: targets, buttonsText: buttonsText, calCost: calCost, calibrate: calibrate,
               CAL_CELL_BUDGET: CAL_CELL_BUDGET, hex64: G5.hex64 };

  // ---- UI --------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'gen5';
    var p = function (k, g, dflt) { return A.pref(SEC, k + '.' + g, dflt); };
    function setp(g, k, v) { var o = {}; o[k + '.' + g] = v; A.setPref(SEC, o); }
    function parseTid(s) { var t = String(s == null ? '' : s).trim(); if (!t) return null;
      var v = /^\$|^0x/i.test(t) ? parseInt(t.replace(/^\$|^0x/i, ''), 16) : Number(t);
      return Number.isInteger(v) && v >= 0 && v <= 0xFFFF ? v : null; }
    function hx(v, n) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < n) s = '0' + s; return s; }
    function clockOf(g) {
      var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(p('when', g, '') || ''));
      return m ? { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: 0 } : null;
    }
    function prof(g) {
      var d = model(A.D).defaults;
      return profileFrom(A.D, g, {
        language: p('lang', g, d.language), dsType: p('ds', g, d.ds_type), mac: p('mac', g, ''),
        timer0Min: p('t0min', g, d.timer0_min), timer0Max: p('t0max', g, d.timer0_max),
        vcount: p('vcount', g, d.vcount), vframe: p('vframe', g, d.vframe), gxstat: p('gxstat', g, d.gxstat)
      });
    }
    function calibrated(g) { return !!p('calibrated', g, false); }

    function profileCardHtml(g) {
      var d = model(A.D).defaults, m = model(A.D);
      var h = '<h3>1. Your console</h3>'
        + '<p class="small">' + esc(m.profile.why) + '</p>'
        + (calibrated(g) ? '' : '<p class="warn"><b>This profile has not been calibrated.</b> The numbers below are '
            + esc(m.defaults_note) + ' Step 4 finds yours.</p>')
        + '<div class="row"><label class="field">MAC address<input type="text" id="g5-mac" value="' + esc(p('mac', g, '')) + '" placeholder="00:09:BF:11:22:33"></label></div>'
        + '<p class="small muted">' + esc(m.profile.mac) + '</p>'
        + '<div class="row">' + A.select('g5-lang', ['english','french','german','italian','japanese','korean','spanish'].map(function (x) { return { id: x, title: x }; }), p('lang', g, d.language), 'Language')
        + A.select('g5-ds', m.profile.ds_type.map(function (x) { return { id: x, title: x.toUpperCase() }; }), p('ds', g, d.ds_type), 'Console') + '</div>'
        + '<div class="row"><label class="field">Timer0 from (hex)<input type="text" id="g5-t0min" value="' + esc(hx(Number(p('t0min', g, d.timer0_min)), 3)) + '"></label>'
        + '<label class="field">to (hex)<input type="text" id="g5-t0max" value="' + esc(hx(Number(p('t0max', g, d.timer0_max)), 3)) + '"></label></div>'
        + '<div class="row"><label class="field">VCount (hex)<input type="text" id="g5-vcount" value="' + esc(hx(Number(p('vcount', g, d.vcount)), 2)) + '"></label>'
        + '<label class="field">VFrame<input type="number" min="0" max="255" id="g5-vframe" value="' + esc(p('vframe', g, d.vframe)) + '"></label>'
        + '<label class="field">GxStat<input type="number" min="0" max="255" id="g5-gxstat" value="' + esc(p('gxstat', g, d.gxstat)) + '"></label></div>'
        + '<p class="small muted">' + esc(m.profile.cgear) + '</p>';
      return A.card(h);
    }

    function targetCardHtml(g) {
      var t = clockOf(g), tid = parseTid(p('tid', g, '')), sid = parseTid(p('sid', g, ''));
      var h = '<h3>2. The Trainer ID you want</h3>'
        + '<div class="row"><label class="field">Trainer ID (decimal or $hex)<input type="text" id="g5-tid" value="' + esc(p('tid', g, '')) + '" placeholder="12345"></label>'
        + '<label class="field">Secret ID (optional)<input type="text" id="g5-sid" value="' + esc(p('sid', g, '')) + '"></label></div>'
        + '<div class="row"><label class="field">Boot minute<input type="datetime-local" id="g5-when" value="' + esc(p('when', g, '')) + '"></label></div>';
      if (tid === null || !t) return A.card(h + '<p class="small warn">' + (tid === null ? 'Type a Trainer ID.' : 'Pick the boot minute.') + '</p>');
      var P, hits;
      try { P = prof(g); hits = targets(A.D, P, tid, sid, t); }
      catch (e) { return A.card(h + '<p class="bad">' + esc(A.errMsg(e)) + '</p>'); }
      if (!hits.length) return A.card(h + '<p class="warn">No second in that minute reaches ' + esc(A.fmtTid(tid))
        + ' on this profile. Try another minute, widen Timer0, or calibrate the profile first - an uncalibrated profile is somebody else\'s console.</p>');
      h += '<p class="small">' + hits.length + ' boot second' + (hits.length === 1 ? '' : 's') + ' in that minute reach <b>' + esc(A.fmtTid(tid)) + '</b>:</p>'
        + '<ul class="plain">' + hits.map(function (x) {
            return '<li><b>second ' + x.second + '</b> <span class="small muted">Timer0 ' + hx(x.timer0, 3)
              + ', buttons ' + esc(buttonsText(x.buttons)) + ', row ' + x.noCount + ', Secret ID ' + x.sid
              + ', seed ' + esc(G5.hex64(x.seed)) + '</span></li>'; }).join('') + '</ul>'
        + '<p class="small muted">' + esc(model(A.D).row_note) + '</p>'
        + '<ol class="plain"><li>Set the DS clock to that date and minute.</li>'
        + '<li>Turn the game on so it <b>boots on that second</b> - the cue below counts you in.</li>'
        + '<li>Hold the listed buttons while it boots (none, on this profile).</li>'
        + '<li>Keep the <b>C-Gear off</b>, start a new game, read the Trainer Card.</li></ol>';
      if (P.timer0Min !== P.timer0Max) h += '<p class="small muted">Your Timer0 range covers ' + (P.timer0Max - P.timer0Min + 1)
        + ' values. A console that alternates between two of them lands on each about half the time, so expect to repeat the boot.</p>';
      h += A.widgets.storyWidgetHtml('g5-story', 'the start of the target minute',
             'Gen 5 seeds once at boot: there is no scene timeline, only the second to boot on.')
        + A.toolsHtml(['eontimer'], 'The community boots this with a timer; this cue stands in for it:')
        + A.sourcesHtml(g, tid, 'derived');
      A.setPref(SEC, (function () { var o = {}; o['pick.' + g] = hits[0]; return o; })());
      return A.card(h);
    }

    function calCardHtml(g) {
      var d = model(A.D).defaults, m = model(A.D);
      var t = clockOf(g), got = parseTid(p('calTid', g, ''));
      var c = { timer0Min: Number(p('ct0min', g, d.cal_timer0_min)), timer0Max: Number(p('ct0max', g, d.cal_timer0_max)),
                vcountMin: Number(p('cvcmin', g, d.cal_vcount_min)), vcountMax: Number(p('cvcmax', g, d.cal_vcount_max)),
                vframeMin: Number(p('cvfmin', g, d.cal_vframe_min)), vframeMax: Number(p('cvfmax', g, d.cal_vframe_max)),
                secondMin: 0, secondMax: 59 };
      var h = '<h3>4. Find your console (calibration)</h3>'
        + '<p class="small">Boot the game at a minute you write down, start a new game, and type the Trainer ID you got. '
        + 'The search finds the Timer0, VCount and VFrame that would have produced it.</p>'
        + '<div class="row"><label class="field">Trainer ID you got<input type="text" id="g5-caltid" value="' + esc(p('calTid', g, '')) + '"></label>'
        + '<label class="field">Boot minute you used<input type="datetime-local" id="g5-calwhen" value="' + esc(p('calWhen', g, '')) + '"></label></div>'
        + '<div class="row"><label class="field">Timer0 from (hex)<input type="text" id="g5-ct0min" value="' + esc(hx(c.timer0Min, 3)) + '"></label>'
        + '<label class="field">to (hex)<input type="text" id="g5-ct0max" value="' + esc(hx(c.timer0Max, 3)) + '"></label></div>';
      var cost;
      try { cost = calCost(c); } catch (e) { return A.card(h + '<p class="bad">' + esc(A.errMsg(e)) + '</p>'); }
      h += '<p class="small' + (cost.cells > CAL_CELL_BUDGET ? ' warn' : ' muted') + '">That range is <b>'
        + cost.cells.toLocaleString() + '</b> boots to hash (' + cost.timer0s + ' Timer0 x ' + cost.vcounts
        + ' VCount x ' + cost.vframes + ' VFrame x ' + cost.seconds + ' seconds). '
        + (cost.cells > CAL_CELL_BUDGET
            ? 'That is over the ' + CAL_CELL_BUDGET.toLocaleString() + ' this page will start, because it would lock up while it ran. Narrow it.'
            : 'This runs on the phone and will block the page while it does.') + '</p>'
        + '<p class="small muted">' + esc(m.calibration_cost_note) + '</p>'
        + '<p><button type="button" id="g5-calrun"' + (cost.cells > CAL_CELL_BUDGET || got === null || !clockOf2(g) ? ' disabled' : '') + '>Find my console</button></p>';
      var out = p('calOut', g, null);
      if (out && out.length) {
        h += '<p class="good">' + out.length + ' match' + (out.length === 1 ? '' : 'es') + '. Copy one into step 1:</p><ul class="plain">'
          + out.slice(0, 12).map(function (r) {
              return '<li>Timer0 <b>' + hx(r.timer0, 3) + '</b>, VCount <b>' + hx(r.vcount, 2) + '</b>, VFrame <b>' + r.vframe
                + '</b> <span class="small muted">(second ' + r.second + ', row ' + r.row + ')</span> '
                + '<button type="button" class="secondary small" data-g5use="' + r.timer0 + ',' + r.vcount + ',' + r.vframe + '">Use</button></li>'; }).join('')
          + '</ul>';
      } else if (out) {
        h += '<p class="warn">Nothing in that range produces that Trainer ID. Widen Timer0 or VCount, check the MAC address, and make sure the C-Gear was off.</p>';
      }
      return A.card(h);
    }
    function clockOf2(g) {
      var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(p('calWhen', g, '') || ''));
      return m ? { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: 0 } : null;
    }

    function render(el, g) {
      var h = '';
      try {
        h = profileCardHtml(g) + targetCardHtml(g)
          + A.card('<h3>3. Method</h3><p class="small">' + esc(model(A.D).seed_formula) + '</p>'
              + '<p class="small">' + esc(model(A.D).id_formula) + '</p>'
              + '<p class="small muted">' + esc(model(A.D).status) + '</p>')
          + calCardHtml(g) + A.sourcesCard(g);
      } catch (e) { h = '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      el.innerHTML = h;
      var pick = p('pick', g, null), t = clockOf(g);
      if (pick && t) {
        A.widgets.mountStory({
          id: 'g5-story', gameName: g, timeline: null,
          noTimelineReason: 'Gen 5 seeds once at boot: there is no scene timeline, only the second to boot on.',
          program: function () {
            var t2 = pick.second, cues = [];
            for (var k = 5; k >= 1; k--) if (t2 - k >= 0) cues.push({ t: Math.max(0.001, t2 - k), freq: 880, ms: 70, label: String(k), kind: 'count' });
            cues.push({ t: Math.max(0.002, t2), freq: 1320, ms: 280, label: 'BOOT', kind: 'A' });
            cues.sort(function (a, b) { return a.t - b.t; });
            return { cues: cues, tPress: Math.max(0.002, t2), dropped: 0 };
          }
        });
      }
    }

    function onEvent(ev, g) {
      var t = ev.target;
      if (ev.type === 'click') {
        if (t.closest && t.closest('#g5-calrun')) {
          var got = parseTid(p('calTid', g, '')), sid = null, when = clockOf2(g);
          if (got === null || !when) return null;
          var d = model(A.D).defaults;
          var c = { timer0Min: Number(p('ct0min', g, d.cal_timer0_min)), timer0Max: Number(p('ct0max', g, d.cal_timer0_max)),
                    vcountMin: Number(p('cvcmin', g, d.cal_vcount_min)), vcountMax: Number(p('cvcmax', g, d.cal_vcount_max)),
                    vframeMin: Number(p('cvfmin', g, d.cal_vframe_min)), vframeMax: Number(p('cvfmax', g, d.cal_vframe_max)),
                    secondMin: 0, secondMax: 59 };
          try { setp(g, 'calOut', calibrate(A.D, prof(g), got, sid, when, c).map(function (r) {
                  return { timer0: r.timer0, vcount: r.vcount, vframe: r.vframe, second: r.second, row: r.row }; })); }
          catch (e) { setp(g, 'calOut', []); A.reportError('gen5 calibrate: ' + A.errMsg(e)); }
          return 'render';
        }
        var use = t.closest && t.closest('[data-g5use]');
        if (use) {
          var v = use.getAttribute('data-g5use').split(',').map(Number);
          setp(g, 't0min', v[0]); setp(g, 't0max', v[0]); setp(g, 'vcount', v[1]); setp(g, 'vframe', v[2]);
          setp(g, 'calibrated', true);
          return 'render';
        }
        return null;
      }
      var hexNum = function (s) { var t2 = String(s).trim().replace(/^0x/i, ''); var v = parseInt(t2, 16); return isFinite(v) ? v : 0; };
      if (t.id === 'g5-mac') { setp(g, 'mac', t.value); return null; }
      if (t.id === 'g5-tid') { setp(g, 'tid', t.value); return null; }
      if (t.id === 'g5-sid') { setp(g, 'sid', t.value); return null; }
      if (t.id === 'g5-caltid') { setp(g, 'calTid', t.value); return null; }
      if (t.id === 'g5-t0min') { setp(g, 't0min', hexNum(t.value)); return null; }
      if (t.id === 'g5-t0max') { setp(g, 't0max', hexNum(t.value)); return null; }
      if (t.id === 'g5-vcount') { setp(g, 'vcount', hexNum(t.value)); return null; }
      if (t.id === 'g5-ct0min') { setp(g, 'ct0min', hexNum(t.value)); return null; }
      if (t.id === 'g5-ct0max') { setp(g, 'ct0max', hexNum(t.value)); return null; }
      if (t.id === 'g5-vframe') { setp(g, 'vframe', Number(t.value) || 0); return null; }
      if (t.id === 'g5-gxstat') { setp(g, 'gxstat', Number(t.value) || 0); return null; }
      if (t.id === 'g5-when') { setp(g, 'when', t.value); return 'render'; }
      if (t.id === 'g5-calwhen') { setp(g, 'calWhen', t.value); return 'render'; }
      if (t.id === 'g5-lang') { setp(g, 'lang', t.value); return 'render'; }
      if (t.id === 'g5-ds') { setp(g, 'ds', t.value); return 'render'; }
      return null;
    }

    A.registerMode({
      id: 'gen5', title: 'DS boot seed', games: Object.keys(A.D.gen5.games),
      render: render, onEvent: onEvent,
      line: function () { return model(A.D).status; },
      sub: function () { return 'needs a console profile'; }
    });
  }
  return pure;
});
