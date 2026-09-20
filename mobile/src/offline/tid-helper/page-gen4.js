// TID Helper page: Gen 4 (Diamond / Pearl / Platinum / HeartGold / SoulSilver).
//
// WHY THIS MODE LOOKS NOTHING LIKE GENS 1-3. On the Game Boy the Trainer ID comes out of a divider the
// player cannot see, so this project had to sweep an emulator and ship a table. On the DS it comes out of
// the SYSTEM CLOCK and a frame count, both of which are closed-form:
//
//   seed = ((month*day + minute + second) & 0xFF) << 24 | (hour & 0xFF) << 16, + (year - 2000) + delay
//   Trainer ID / Secret ID = the SECOND output of a Mersenne Twister seeded with that, low / high 16 bits
//
// So there is no table here and none is needed - the answer is computed on the device. What a person does
// instead of "press A at frame N" is: set the DS clock to a particular minute, start the game at one moment
// and press A at another. That is the two-phase timer, and it is EonTimer's model, ported.
//
// WHAT THIS PROJECT DID AND DID NOT DO. It derived nothing. gen4.js and seedtime4.js are transcriptions of
// PokeFinder's routines, and the data file says so in its own credits. What was verified here is that the
// two independently-written implementations shipped in this repo agree: 3,800,000 random (date, time, delay)
// triples give the same seed from gen4.seed() and seedtime4.calcSeed(), and 304,000 seedToTimes() rows
// reproduce the seed they were derived from. Zero disagreements. That is a consistency check, not a DS.
//
// UMD: the pure layer runs under node so the tests can drive it without a DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('../../../../src/lib/shiny/gen4.js'), require('../../../../src/lib/shiny/seedtime4.js'));
  } else root.TidHelperGen4 = factory(root, root.ShinyGen4, root.ShinySeedTime4);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root, G4, ST4) {
  'use strict';
  function fail(msg) { throw new Error(msg); }
  // REGISTRATION HAPPENS AT SCRIPT LOAD, BEFORE bindData(). A.D does not exist yet at that moment, so
  // reading A.D here threw a TypeError, the module never reached registerMode(), and the Gen 4 games
  // silently vanished from the home screen while everything else carried on. The data global IS already
  // there - the data script is slotted above the page scripts - which is what page-gen2-psr.js reads.
  function gen4Games() {
    var d = root.TID_HELPER_DATA, g = d && d.gen4 && d.gen4.games;
    return g ? Object.keys(g) : ['diamond', 'pearl', 'platinum', 'heartgold', 'soulsilver'];
  }

  function model(D) { if (!D || !D.gen4) fail('gen4-tid.json is not loaded'); return D.gen4; }
  function game(D, key) { var g = model(D).games[key]; if (!g) fail('no gen4 game ' + key); return g; }
  function isHgss(D, key) { return game(D, key).family === 'hgss'; }

  // ---- the calculation ------------------------------------------------------------------------------
  function seedOf(t, delay) { return G4.seed(t.year, t.month, t.day, t.hour, t.minute, t.second, delay) >>> 0; }
  function idsOf(seedValue) { return G4.tidSid(seedValue >>> 0); }

  // Every (second, delay) inside one clock MINUTE that produces `tid`. The minute is fixed because that is
  // what a person sets on the DS; the second and the delay are what the timer then hits.
  function targets(D, key, tid, t, delayMin, delayMax, limit) {
    if (!(Number.isInteger(tid) && tid >= 0 && tid <= 0xFFFF)) fail('Trainer ID must be 0..65535');
    if (!(delayMin >= 0 && delayMax >= delayMin)) fail('the delay range is backwards');
    var d = model(D).defaults;
    var hits = G4.searchTid(tid, t.year, t.month, t.day, t.hour, t.minute, delayMin, delayMax, limit || d.search_limit);
    // every row must actually produce the Trainer ID it is filed under, or the table is decoration
    for (var i = 0; i < hits.length; i++) {
      var back = idsOf(hits[i].seed);
      if (back.tid !== tid) fail('gen4: row ' + i + ' claims Trainer ID ' + tid + ' but its seed gives ' + back.tid);
    }
    return hits;
  }

  // ---- the timer ------------------------------------------------------------------------------------
  // Phase 1 is clock-confirm -> START THE GAME. Phase 2 is start -> the A that ends the intro. The two
  // always sum to targetSecond*1000 + 200 + N*60000, so the press lands 200 ms into the target second.
  function phases(hit, calDelay, calSecond) {
    var p = G4.timerPhases(hit.delay, hit.second, calDelay, calSecond);
    if (!isFinite(p.phase1Ms) || !isFinite(p.phase2Ms)) fail('the timer has no finite phases for that calibration');
    if (!(p.phase2Ms > 0)) fail('phase 2 is ' + Math.round(p.phase2Ms) + ' ms: the A press would be due before the game starts. Lower the calibrated delay, or pick a longer target delay.');
    return p;
  }
  // How many minutes BEFORE the target minute the DS clock has to be set. EonTimer's own figure is taken at
  // calibration zero; the spanned figure is the same sum off YOUR calibration. They disagree for about 9% of
  // (delay, second) pairs, and where they do the spanned one is the one that happens, so it is the one shown.
  function clockMinutes(hit, calDelay, calSecond) {
    var before = G4.minutesBefore(hit.delay, hit.second);
    var spanned = G4.minutesSpanned(hit.delay, hit.second, calDelay, calSecond);
    return { before: before, spanned: spanned, differ: before !== spanned, use: spanned };
  }
  function calibrate(calDelay, targetDelay, hitDelay) { return G4.calibrate(calDelay, targetDelay, hitDelay); }

  // ---- what a person can SEE, which is how every other mode in this app is anchored ------------------
  // A Trainer ID is only readable after the intro is over, which is far too late to correct anything. The
  // community's answer is a sequence that is visible EARLIER and is a function of the same seed: the Poketch
  // coin toss on DPPt (Mersenne Twister, and free - it costs no LCRNG advances) and Elm's phone calls on
  // HGSS (LCRNG, one advance each). So a miss is diagnosable, the same way the Gen 2 reverse table made a
  // missed Crystal attempt readable instead of random.
  function flipsFor(seedValue, count) { return G4.coinFlips(seedValue >>> 0, count || 10); }
  function elmFor(seedValue, count, skips) { return G4.elmCalls(seedValue >>> 0, count || 10, skips || 0); }
  // "I saw H T T H..." -> which (second, delay) that was. Centred on the row being attempted, because the
  // flips repeat across the whole space and only the neighbourhood of the attempt is a plausible answer.
  function matchFlips(D, flips, t, centreSecond, secondRadius, delayCentre, delayRadius, limit) {
    var d = model(D).defaults;
    var r = secondRadius == null ? d.flip_second_radius : secondRadius;
    var w = delayRadius == null ? d.flip_delay_radius : delayRadius;
    var lo = Math.max(0, delayCentre - w), hi = Math.min(0xFFFF, delayCentre + w);
    return G4.matchCoinFlips(String(flips || ''), t.year, t.month, t.day, t.hour, t.minute, centreSecond, r, lo, hi, limit || 10);
  }
  // the diagnosis, in the same shape the Gen 2 psr mode uses: what did I actually hit, and by how much
  function diagnose(hit, hitDelay) {
    if (!Number.isInteger(hitDelay)) return { kind: 'unknown' };
    if (hitDelay === hit.delay) return { kind: 'target' };
    var off = hitDelay - hit.delay;
    return { kind: 'delay', errorDelays: off, errorMs: off * 1000 / Number(model0FPS()), late: off > 0 };
  }
  function model0FPS() { return G4.NDS_FPS; }

  var pure = { model: model, game: game, isHgss: isHgss, seedOf: seedOf, idsOf: idsOf, targets: targets,
               phases: phases, clockMinutes: clockMinutes, calibrate: calibrate,
               flipsFor: flipsFor, elmFor: elmFor, matchFlips: matchFlips, diagnose: diagnose,
               NDS_FPS: G4.NDS_FPS, seedToTimes: function (s, y, o) { return ST4.seedToTimes(s >>> 0, y, o); } };

  // ---- UI --------------------------------------------------------------------------------------------
  var A = root.TidHelperApp;
  if (A && typeof document !== 'undefined') {
    var esc = A.esc, SEC = 'gen4';
    var p = function (k, g, dflt) { return A.pref(SEC, k + '.' + g, dflt); };
    function setp(g, k, v) { var o = {}; o[k + '.' + g] = v; A.setPref(SEC, o); }
    function hex4(v) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < 8) s = '0' + s; return s; }
    function parseTid(s) { var t = String(s == null ? '' : s).trim(); if (!t) return null;
      var v = /^\$|^0x/i.test(t) ? parseInt(t.replace(/^\$|^0x/i, ''), 16) : Number(t);
      return Number.isInteger(v) && v >= 0 && v <= 0xFFFF ? v : null; }
    // the boot minute, stored as the <input type="datetime-local"> string the phone gives us
    function clockOf(g) {
      var s = String(p('when', g, '') || '');
      var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
      if (!m) return null;
      return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: 0 };
    }
    function calDelay(g) { var v = Number(p('calD', g, 500)); return isFinite(v) ? v : 500; }
    function calSecond(g) { var v = Number(p('calS', g, 14)); return isFinite(v) ? v : 14; }
    function chosen(g) { var v = p('pick', g, null); return v && Number.isInteger(v.delay) ? v : null; }

    function fmtMs(ms) { var s = Math.max(0, ms) / 1000; return s.toFixed(3) + ' s'; }

    function targetCardHtml(g) {
      var D = A.D, m = model(D), d = m.defaults;
      var tid = parseTid(p('tid', g, '')), t = clockOf(g);
      var h = '<h3>1. The Trainer ID you want</h3>'
        + '<div class="row"><label class="field">Trainer ID (decimal or $hex)'
        + '<input type="text" id="g4-tid" value="' + esc(p('tid', g, '')) + '" placeholder="7777 or $1E61"></label></div>'
        + '<div class="row"><label class="field">Boot minute (the DS clock you will target)'
        + '<input type="datetime-local" id="g4-when" value="' + esc(p('when', g, '')) + '"></label></div>'
        + '<div class="row"><label class="field">Delay from<input type="number" min="0" max="65535" id="g4-dmin" value="' + esc(p('dmin', g, d.delay_min)) + '"></label>'
        + '<label class="field">to<input type="number" min="0" max="65535" id="g4-dmax" value="' + esc(p('dmax', g, d.delay_max)) + '"></label></div>'
        + '<p class="small muted">The delay is DS frames from powering the game on to the A press that ends the intro. One delay is '
        + (1000 / G4.NDS_FPS).toFixed(3) + ' ms. A wider range gives more chances to pick from and a longer wait.</p>';
      if (tid === null || !t) return A.card(h + '<p class="small warn">' + (tid === null ? 'Type a Trainer ID.' : 'Pick the boot minute.') + '</p>');
      var hits;
      try { hits = targets(D, g, tid, t, Number(p('dmin', g, d.delay_min)) || 0, Number(p('dmax', g, d.delay_max)) || 0); }
      catch (e) { return A.card(h + '<p class="bad">' + esc(A.errMsg(e)) + '</p>'); }
      if (!hits.length) return A.card(h + '<p class="warn">No second and delay in that minute reaches ' + esc(A.fmtTid(tid))
        + '. Widen the delay range, or try another minute - every minute of the clock reaches a different set.</p>');
      h += '<p class="small">' + hits.length + ' way' + (hits.length === 1 ? '' : 's') + ' to reach <b>' + esc(A.fmtTid(tid))
        + '</b> in that minute. Pick one - a shorter delay is a shorter wait, and the parity note below matters.</p><ul class="plain g4hits">';
      var pick = chosen(g);
      hits.forEach(function (x, i) {
        var on = pick && pick.second === x.second && pick.delay === x.delay;
        h += '<li><button type="button" class="' + (on ? '' : 'secondary ') + 'small" data-g4pick="' + i + '">'
          + 'second ' + x.second + ', delay ' + x.delay + '</button> <span class="small muted">seed ' + hex4(x.seed)
          + ', Secret ID ' + x.sid + ', delay is ' + (x.delay % 2 ? 'odd' : 'even') + '</span></li>';
      });
      h += '</ul>';
      var par = {}; hits.forEach(function (x) { par[x.delay % 2] = 1; });
      if (Object.keys(par).length === 1) h += '<p class="small muted">Every hit in this minute has an '
        + (par[1] ? 'ODD' : 'EVEN') + ' delay. If your console keeps landing on the other parity you will never hit it from this minute - pick another minute.</p>';
      A.setPref(SEC, (function () { var o = {}; o['hits.' + g] = hits; return o; })());
      return A.card(h);
    }

    function planCardHtml(g) {
      var pick = chosen(g), t = clockOf(g);
      if (!pick || !t) return '';
      var cd = calDelay(g), cs = calSecond(g), ph, cm;
      try { ph = phases(pick, cd, cs); cm = clockMinutes(pick, cd, cs); }
      catch (e) { return A.card('<h3>2. What to do</h3><p class="bad">' + esc(A.errMsg(e)) + '</p>'); }
      var ids = idsOf(pick.seed);
      var h = '<h3>2. What to do</h3>'
        + '<p><b>' + esc(A.fmtTid(ids.tid)) + '</b> - Secret ID ' + ids.sid + '. <span class="muted">seed ' + hex4(pick.seed)
        + ', second ' + pick.second + ', delay ' + pick.delay + '.</span></p>'
        + '<ol class="plain">'
        + '<li>Set the DS clock to <b>' + cm.use + ' minute' + (cm.use === 1 ? '' : 's') + ' before</b> '
        + esc(String(p('when', g, ''))) + ', and do not confirm it yet.</li>'
        + '<li>Tap Run below, then press the clock\'s confirm button on the <b>first tone</b>.</li>'
        + '<li><b>Start the game</b> on the second tone (' + fmtMs(ph.phase1Ms) + ' later).</li>'
        + '<li>Let the intro run. Press <b>A</b> to end it on the final tone (' + fmtMs(ph.phase2Ms) + ' after that), after the five count-in beeps.</li>'
        + '<li>Start a new game and read the Trainer Card.</li>'
        + '</ol>';
      if (cm.differ) h += '<p class="small warn">EonTimer would say ' + cm.before + ' minute' + (cm.before === 1 ? '' : 's')
        + ' before, because it quotes the figure at calibration zero. Your calibration spans ' + cm.spanned
        + '. Use ' + cm.spanned + ' - that is what your countdown actually covers.</p>';
      h += '<div class="row"><label class="field">Calibrated delay<input type="number" step="0.1" id="g4-cald" value="' + esc(cd) + '"></label>'
        + A.signButtonHtml('g4-cald')
        + '<label class="field">Calibrated second<input type="number" min="0" max="59" id="g4-cals" value="' + esc(cs) + '"></label></div>'
        + '<p class="small muted">These two describe YOUR console and your reactions, not the game. They start at the '
        + 'community\'s usual 500 / 14 and step 3 below moves them from what you actually hit.</p>'
        + A.widgets.storyWidgetHtml('g4-story', 'the clock confirm',
            'This is a DS: there is no traced scene timeline here, only the two measured phases above.')
        + A.toolsHtml(['eontimer'], 'The two phases and the delay calibration are EonTimer\'s Gen 4 timer model, ported:')
        + A.sourcesHtml(g, ids.tid, 'derived');
      return A.card(h);
    }

    function checkCardHtml(g) {
      var pick = chosen(g), t = clockOf(g);
      if (!pick || !t) return '';
      var hg = isHgss(A.D, g), m = model(A.D);
      var h = '<h3>3. What did you actually hit?</h3>';
      if (hg) {
        var skips = Number(p('skips', g, 0)) || 0;
        h += '<p class="small">' + esc(m.verification.hgss) + '</p>'
          + '<div class="row"><label class="field">Roamer skips<input type="number" min="0" id="g4-skips" value="' + esc(skips) + '"></label></div>'
          + '<p class="small">At the delay you are aiming for, Elm\'s calls read <b class="mono">' + esc(elmFor(pick.seed, 10, skips)) + '</b>.</p>'
          + '<p class="small muted">Compare that with what you get. There is no matcher for Elm calls here: they cost an '
          + 'advance each and depend on the Pokerus flag and on active roamers, so a search would give confident wrong answers.</p>';
      } else {
        h += '<p class="small">' + esc(m.verification.dppt) + '</p>'
          + '<p class="small">At the delay you are aiming for, the Coin Toss reads <b class="mono">' + esc(flipsFor(pick.seed, 10)) + '</b>.</p>'
          + '<div class="row"><label class="field">The flips you actually saw (H/T)'
          + '<input type="text" id="g4-flips" value="' + esc(p('flips', g, '')) + '" placeholder="HTTHTHHTTH"></label></div>';
        var typed = String(p('flips', g, '') || '').replace(/[^HTht]/g, '');
        if (typed.length >= 6) {
          var got = matchFlips(A.D, typed, t, pick.second, null, pick.delay, null, 10);
          if (!got.length) h += '<p class="warn">No delay near your target produces those flips. Check the sequence, or widen the search by aiming at a different delay.</p>';
          else {
            var best = got[0];
            for (var i = 1; i < got.length; i++) if (Math.abs(got[i].delay - pick.delay) < Math.abs(best.delay - pick.delay)) best = got[i];
            var dg = diagnose(pick, best.delay);
            h += '<p class="' + (dg.kind === 'target' ? 'good' : '') + '">' + got.length + ' candidate' + (got.length === 1 ? '' : 's')
              + '; nearest is <b>second ' + best.second + ', delay ' + best.delay + '</b>'
              + (dg.kind === 'target' ? ' - <b>that is the target.</b>'
                 : ' - you were <b>' + Math.abs(dg.errorDelays) + ' delay' + (Math.abs(dg.errorDelays) === 1 ? '' : 's')
                   + ' ' + (dg.late ? 'LATE' : 'EARLY') + '</b> (' + Math.abs(dg.errorMs).toFixed(0) + ' ms).') + '</p>'
              + '<p><button type="button" data-g4cal="' + best.delay + '">Calibrate from this</button></p>';
          }
        }
      }
      h += '<div class="row"><label class="field">Or type the delay you hit<input type="number" min="0" max="65535" id="g4-hit" value="' + esc(p('hit', g, '')) + '"></label>'
        + '<button type="button" data-g4cal="">Calibrate from hit</button></div>';
      var msg = p('calmsg', g, '');
      if (msg) h += '<p class="small good">' + esc(msg) + '</p>';
      return A.card(h);
    }

    function render(el, g) {
      var h = '';
      try {
        h = targetCardHtml(g) + planCardHtml(g) + checkCardHtml(g)
          + A.card('<h3>Method</h3><p class="small">' + esc(model(A.D).seed_formula) + '</p>'
              + '<p class="small">' + esc(model(A.D).id_formula) + '</p>'
              + '<p class="small muted">' + esc(model(A.D).status) + '</p>')
          + A.sourcesCard(g);
      } catch (e) { h = '<p class="bad">' + esc(A.errMsg(e)) + '</p>'; }
      el.innerHTML = h;
      var pick = chosen(g), t = clockOf(g);
      if (pick && t) {
        try {
          var ph = phases(pick, calDelay(g), calSecond(g));
          A.widgets.mountStory({
            id: 'g4-story', gameName: g, timeline: null,
            noTimelineReason: 'This is a DS: there is no traced scene timeline here, only the two measured phases.',
            program: function () {
              var t1 = ph.phase1Ms / 1000, t2 = (ph.phase1Ms + ph.phase2Ms) / 1000;
              var cues = [{ t: 0.001, freq: 880, ms: 70, label: 'confirm', kind: 'press' },
                          { t: t1, freq: 1100, ms: 180, label: 'START THE GAME', kind: 'press' }];
              for (var k = 5; k >= 1; k--) if (t2 - k > t1 + 0.2) cues.push({ t: t2 - k, freq: 880, ms: 70, label: String(k), kind: 'count' });
              cues.push({ t: t2, freq: 1320, ms: 280, label: 'A', kind: 'A' });
              cues.sort(function (a, b) { return a.t - b.t; });
              return { cues: cues, tPress: t2, dropped: 0 };
            }
          });
        } catch (e) { /* the plan card already printed why */ }
      }
    }

    function onEvent(ev, g) {
      var t = ev.target;
      if (ev.type === 'click') {
        var pk = t.closest && t.closest('[data-g4pick]');
        if (pk) {
          var hits = A.pref(SEC, 'hits.' + g, []) || [];
          var x = hits[Number(pk.getAttribute('data-g4pick'))];
          if (x) { setp(g, 'pick', x); setp(g, 'calmsg', ''); }
          return 'render';
        }
        var cal = t.closest && t.closest('[data-g4cal]');
        if (cal) {
          var pick = chosen(g);
          var raw = cal.getAttribute('data-g4cal');
          var hit = raw === '' ? Number(p('hit', g, '')) : Number(raw);
          if (!pick || !Number.isInteger(hit)) { setp(g, 'calmsg', 'Pick a target and give the delay you hit first.'); return 'render'; }
          var next = Math.round(calibrate(calDelay(g), pick.delay, hit) * 10) / 10;
          setp(g, 'calD', next);
          setp(g, 'calmsg', 'You hit delay ' + hit + ' aiming at ' + pick.delay + '. Calibrated delay is now ' + next + '.');
          return 'render';
        }
        return null;
      }
      // typed fields: store and re-render, EXCEPT the ones a person types many characters into - those
      // patch nothing and let the next render pick the value up, so the phone keyboard survives (see
      // correction-advice.test.cjs for why this rule exists).
      if (t.id === 'g4-tid') { setp(g, 'tid', t.value); setp(g, 'pick', null); return null; }
      if (t.id === 'g4-flips') { setp(g, 'flips', t.value); return null; }
      if (t.id === 'g4-hit') { setp(g, 'hit', t.value); return null; }
      if (t.id === 'g4-when') { setp(g, 'when', t.value); setp(g, 'pick', null); return 'render'; }
      if (t.id === 'g4-dmin') { setp(g, 'dmin', Number(t.value) || 0); return null; }
      if (t.id === 'g4-dmax') { setp(g, 'dmax', Number(t.value) || 0); return null; }
      if (t.id === 'g4-cald') { setp(g, 'calD', Number(t.value) || 0); return null; }
      if (t.id === 'g4-cals') { setp(g, 'calS', Number(t.value) || 0); return null; }
      if (t.id === 'g4-skips') { setp(g, 'skips', Number(t.value) || 0); return null; }
      return null;
    }

    A.registerMode({
      id: 'gen4', title: 'DS clock and boot delay', games: gen4Games(),
      render: render, onEvent: onEvent,
      line: function () { return model(A.D).status; },
      sub: function (g) { return isHgss(A.D, g) ? 'verify with Elm calls' : 'verify with the Poketch coin toss'; }
    });
  }
  return pure;
});
