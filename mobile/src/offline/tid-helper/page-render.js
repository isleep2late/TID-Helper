// TID Helper page: the home screen (game picker: every card lists its methods with a one-line status from the data),
// the boot sequence (bind the engines and window.TID_HELPER_DATA, install the RN bridge, post 'ready', render), the
// event delegation the mode modules answer, and the settings card. Browser-only.
(function (root) {
  'use strict';
  var A = root.TidHelperApp, esc = A.esc;
  // the games in the order the picker shows them, each with the data block that names it
  function games() {
    var D = A.D, out = [];
    Object.keys(D.gen1.games).forEach(function (k) { out.push({ key: k, name: D.gen1.games[k].name, gen: 'Gen 1', status: D.gen1.games[k].status }); });
    Object.keys(D.gen2.games).forEach(function (k) { out.push({ key: k, name: D.gen2.games[k].name, gen: 'Gen 2', status: D.gen2.games[k].status }); });
    Object.keys(D.gen3rs.games).forEach(function (k) { out.push({ key: k, name: D.gen3rs.games[k].methodology.name.split(':')[0], gen: 'Gen 3', status: D.gen3rs.games[k].status }); });
    Object.keys(D.gen3sid.games).forEach(function (k) { if (D.gen3sid.games[k].status === 'sid') out.push({ key: k, name: D.gen3sid.games[k].name, gen: 'Gen 3', status: D.gen3sid.games[k].status }); });
    Object.keys(D.gen4.games).forEach(function (k) { out.push({ key: k, name: D.gen4.games[k].name, gen: 'Gen 4', status: D.gen4.status }); });
    Object.keys(D.gen5.games).forEach(function (k) { out.push({ key: k, name: D.gen5.games[k].name, gen: 'Gen 5', status: D.gen5.status }); });
    return out;
  }
  // WHY THE FIRST THING ON THIS PAGE IS A DISCLAIMER. This tool answers "a route to this Trainer ID".
  // A run needs "the FASTEST route to this Trainer ID", and the speedrunning community already has
  // tools that answer that one. Measured over the shipped Crystal routes the median is 85.4 s against
  // 46.2 s for the best route to the same ID, so following a route from here is usually a net loss to
  // whoever follows it. The tool still does what it does and is kept for that, but nobody should adopt
  // it for a run without meeting this first - which is why it is above the intro and not in a footer.
  var DISCORDS = [
    ['Gen 1-3 Pokemon Speedrunning', 'https://discord.gg/NjQFEkc'],
    ['DS Pokemon Speedrunning', 'https://discord.gg/HqRC6ZU'],
    ['3DS Pokemon Speedrunning', 'https://discord.gg/suBPHnw'],
    ['Switch Pokemon Speedrunning', 'https://discord.gg/2Sfc3r9']
  ];
  function archivalHtml() {
    return '<div class="card archival"><h3>Archival</h3>' +
      '<p class="small">This tool is not optimized for speedrunners: it finds <i>a</i> route to a Trainer ID, not the fastest one, and the speedrunning community already has tools that find the fastest. It is kept on the app and the website for archival purposes. It can still be used to obtain a Trainer ID.</p>' +
      '<p class="small muted">Helpful community resources are on the speedrunning discords:</p>' +
      '<ul class="plain small">' + DISCORDS.map(function (d) { return '<li>' + A.linkHtml(d[1], d[0]) + '</li>'; }).join('') + '</ul>' +
      '</div>';
  }
  function homeHtml() {
    var h = '<h1>Get a TID</h1>' + archivalHtml() + '<p class="note">Pick the game, then the method. Every method states its platform and its verification status in the data\'s own words; predictions hold only under the methodology shown. Everything on this page is embedded - the routes, the engines, the cues and the sources - so it works with no connection, and every Trainer ID result names its original source or says that none is on record.</p>' +
      A.toolsHtml(['flowtimer', 'eontimer'], 'The cues stand in for the community\'s timers, FlowTimer for the Gen 1-2 speedrun manips and EonTimer for Gen 3-5:');
    games().forEach(function (g) {
      var modes = A.modesFor(g.key);
      if (!modes.length) return;
      h += '<div class="card game"><div class="gh"><span class="gen">' + esc(g.gen) + '</span><span class="gn">' + esc(g.name) + '</span></div>' +
        modes.map(function (m) {
          var line = '', sub = '';
          try { line = m.line(g.key); sub = m.sub ? m.sub(g.key) : ''; } catch (e) { line = 'unavailable: ' + A.errMsg(e); }
          return '<button type="button" class="choice mode" data-game="' + esc(g.key) + '" data-mode="' + esc(m.id) + '"><span class="ct">' + esc(m.title) + '</span>' + (sub ? '<span class="cs mono">' + esc(sub) + '</span>' : '') + '<span class="cs clamp">' + esc(line) + '</span></button>';
        }).join('') + '</div>';
    });
    // WHERE THE LIST STOPS. This used to be a card saying the DS games were "a seed search on Shiny
    // Solution's Gen 4 and Gen 5 tabs rather than a timed press here", with two buttons that left the app.
    // Both generations are modes in this app now, so that card was not merely redundant - it was false, and
    // it sat directly above the very buttons it was telling people did not exist.
    h += A.beyondHtml();
    h += '<div class="card"><h3>Settings</h3>' +
      '<label class="check"><input type="checkbox" id="set-flash"' + (A.pref('cue', 'flash', true) ? ' checked' : '') + '> Full-screen flashes with the beeps</label>' +
      '<label class="check"><input type="checkbox" id="set-sound"' + (A.pref('cue', 'sound', true) ? ' checked' : '') + '> Sound</label>' +
      '<label class="field">Visual offset (ms, positive = draw later)<input type="number" step="10" id="set-visual" value="' + esc(A.pref('cue', 'visualOffsetMs', 0)) + '"></label>' +
      A.signButtonHtml('set-visual') +
      '<label class="field">Hold A (s): how long the green A! stays up (Gen 1)<input type="number" step="0.5" min="0.5" id="set-ahold" value="' + esc(A.pref('gen1timed', 'aHoldS', A.Cue.A_HOLD_S)) + '"></label>' +
      '<p class="small muted" id="cuestate"></p></div>';
    h += '<div class="card"><h3>Data</h3><p class="small muted">gen1-tid.json, gen2-tid.json, gen2-psr.json, gen3-enc.json, gen3-sid.json, gen1-buffer.json, gen3-rs.json, gen4-tid.json, gen5-tid.json, scene-timelines.json and tid-sources.json (the published-manipulation citations and the timer credits) are embedded verbatim; the engines are the site\'s (rng.js, gen1tid.js, gen2tid.js, gen4.js, seedtime4.js, gen5.js, tid-sources.js) and RNG Solution\'s buffer-decode.js. Page ' + esc(A.version) + '.</p></div>';
    return h;
  }
  // A RE-RENDER MUST NOT THROW THE KEYBOARD AWAY. Thirteen typed fields across six modes return 'render'
  // from their input handler, which rebuilds the card the field lives in and then scrolls to the top. On a
  // phone that is: type one digit, lose the keyboard, scroll back down, tap the box, type the next digit.
  // The owner reported exactly that on 2026-09-20 ("1, then scroll down and touch the text box, 7, then
  // scroll down and 0") and it cost him a run of attempts before it was understood.
  //
  // The real cure is per field - patch in place and do not re-render at all, which is what the Gen 2 psr
  // correction now does. This is the safety net under all of them: if the re-render was triggered from a
  // field that still exists afterwards, put the focus, the caret and the scroll position back. Restoring
  // focus inside the input event keeps the soft keyboard up; scrollTo(0,0) is kept for every OTHER render,
  // because navigating to a new screen should start at the top.
  function render() {
    var main = A.$('main'); if (!main) return;
    var act = document.activeElement;
    var keepId = act && act.id && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA') ? act.id : null;
    var selS = null, selE = null, keepY = 0;
    if (keepId) {
      // a number input throws on selectionStart in some engines, so this is never allowed to break a render
      try { selS = act.selectionStart; selE = act.selectionEnd; } catch (e) { selS = null; }
      keepY = root.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
    }
    A.widgets.stopAll(); A.widgets.reset();
    var back = A.$('back'), title = A.$('title');
    if (A.screen === 'home' || !A.game || !A.mode || !A.modes[A.mode]) {
      A.screen = 'home';
      main.innerHTML = homeHtml();
      if (back) back.classList.add('hidden'); if (title) title.textContent = 'Get a TID';
    } else {
      var mode = A.modes[A.mode];
      if (back) back.classList.remove('hidden'); if (title) title.textContent = mode.title;
      try { mode.render(main, A.game); } catch (e) { main.innerHTML = '<p class="bad">' + esc('This mode could not render: ' + A.errMsg(e)) + '</p>'; A.reportError('render ' + A.mode + ': ' + A.errMsg(e), e && e.stack); }
    }
    if (A.Cue.onState) A.Cue.onState();
    var back2 = keepId ? A.$(keepId) : null;
    if (back2) {
      try { back2.focus({ preventScroll: true }); } catch (e) { try { back2.focus(); } catch (e2) {} }
      if (selS != null) { try { back2.setSelectionRange(selS, selE); } catch (e3) {} }
      root.scrollTo(0, keepY);
    } else {
      root.scrollTo(0, 0);
    }
    root.__tidHelperScreen = { screen: A.screen, game: A.game, mode: A.mode };
  }
  A.render = render;
  A.onNavigate = render;
  A.onInit = function () {
    A.Cue.visualOffsetMs = Number(A.pref('cue', 'visualOffsetMs', 0)) || 0;
    A.Cue.sound = A.pref('cue', 'sound', true) !== false;
    var nav = A.prefs.nav;
    if (A.isObj(nav) && nav.game && nav.mode && A.modes[nav.mode] && A.modes[nav.mode].games.indexOf(nav.game) !== -1) { A.screen = 'mode'; A.game = nav.game; A.mode = nav.mode; }
    render();
  };
  // KEPT, THOUGH THE HOME SCREEN NO LONGER EMITS IT. Gen 4 and Gen 5 are modes in this app now, so the card
  // that used to send people to Shiny Solution is gone. The 'open-shiny' message is still part of the host
  // protocol (tidHelperProtocol.ts, TidHelperScreen.tsx) and the site's tabs still do things this app does
  // not - the Method-1 shiny search, the Cute Charm table - so the door is left open rather than bricked up.
  // on the website the page is a plain document, so it goes to the Shiny Solution page with the tab in the query
  function openShiny(tab) {
    if (root.ReactNativeWebView) { A.post({ type: 'open-shiny', tab: tab }); return; }
    root.location.href = '/shiny-solution?tab=' + encodeURIComponent(tab);
  }
  function onClick(ev) {
    var t = ev.target;
    if (t.closest && t.closest('#back')) { A.widgets.clearCalMsgs(); A.go('home'); return; }
    var os = t.closest && t.closest('[data-open-shiny]');
    if (os) { openShiny(os.getAttribute('data-open-shiny')); return; }
    // a cited source: inside the app the WebView refuses every non-file navigation, so the screen opens the system browser
    var ext = t.closest && t.closest('a[data-ext]');
    if (ext && root.ReactNativeWebView) { ev.preventDefault(); A.post({ type: 'open-url', url: ext.getAttribute('href') }); return; }
    var mb = t.closest && t.closest('.choice.mode');
    if (mb) { A.widgets.clearCalMsgs(); A.go('mode', mb.getAttribute('data-game'), mb.getAttribute('data-mode')); return; }
    var sb = t.closest && t.closest('[data-story]'); if (sb) { A.widgets.onStoryClick(sb); return; }
    var cb = t.closest && t.closest('[data-cal]'); if (cb) { A.widgets.onCalClick(cb); return; }
    // handled here rather than per mode: the button belongs to whichever field names it, and flipping
    // fires the field's own 'input' event, so the mode's existing handler does the saving.
    var sf = t.closest && t.closest('[data-sign]'); if (sf) { A.flipSign(sf.getAttribute('data-sign')); return; }
    var yt = t.closest && t.closest('[data-yt]'); if (yt) { A.showVideo(yt.getAttribute('data-yt')); return; }
    if (t.closest && t.closest('#runstop')) { A.widgets.stopAll(); return; }
    if (A.screen === 'mode' && A.modes[A.mode] && A.modes[A.mode].onEvent) {
      var r = A.modes[A.mode].onEvent(ev, A.game);
      if (r === 'render') render();
    }
  }
  function onInput(ev) {
    var t = ev.target;
    if (t.id === 'set-flash') { A.setPref('cue', { flash: t.checked }); return; }
    if (t.id === 'set-sound') { A.setPref('cue', { sound: t.checked }); A.Cue.sound = t.checked; return; }
    if (t.id === 'set-visual') { A.setPref('cue', { visualOffsetMs: Number(t.value) || 0 }); A.Cue.visualOffsetMs = Number(t.value) || 0; return; }
    if (t.id === 'set-ahold') { A.setPref('gen1timed', { aHoldS: Number(t.value) || A.Cue.A_HOLD_S }); return; }
    if (A.screen === 'mode' && A.modes[A.mode] && A.modes[A.mode].onEvent) {
      var r = A.modes[A.mode].onEvent(ev, A.game);
      if (r === 'render') render();
    }
  }
  function boot() {
    try {
      A.Cue = root.TidHelperCue; A.Story = root.TidHelperStoryboard;
      // EVERY engine bindData demands, from the globals the inlined scripts define. This line and
      // bindData's checklist are one contract in two places: adding Gen 4 and Gen 5 to the checklist and
      // not to here shipped a page that threw "ShinyGen4 engine missing" on boot and rendered nothing,
      // while the suite stayed green because tests/tid-helper/helpers.cjs builds its OWN engines object.
      // A test that supplies the dependencies itself cannot notice the real caller failing to.
      A.bindData(root.TID_HELPER_DATA, { G1: root.ShinyGen1Tid, G2: root.ShinyGen2Tid, BD: root.BufferDecode,
        TS: root.TidSources, G4: root.ShinyGen4, ST4: root.ShinySeedTime4, G5: root.ShinyGen5 });
      if (!root.TidHelperGen3Rs || !root.TidHelperGen3Rs.checkLcrng(A.D)) throw new Error('the R/S engine is missing');
      var local = A.readLocal(); if (local) A.prefs = A.mergePrefs(A.prefs, local);
      A.Cue.visualOffsetMs = Number(A.pref('cue', 'visualOffsetMs', 0)) || 0;
      A.Cue.sound = A.pref('cue', 'sound', true) !== false;
      document.addEventListener('click', onClick);
      document.addEventListener('input', onInput);
      // 'change' used to reach a mode only from a SELECT or a date / time input, on the reasoning that those are
      // the controls whose value arrives in one piece. But a mode that wants a text or number field's COMMITTED
      // value - rather than one event per keystroke, which would re-render the field out from under the caret -
      // then had nothing to listen to at all: the SC Metronome's "Interval (ms)" and "Attempt every (s)" handlers
      // both open with `if (ev.type !== 'change') return null`, so every number typed into them was dropped on the
      // floor while the field went on displaying it.
      // It is forwarded for the controls where 'change' says something 'input' does not - a value that is TYPED,
      // arriving a keystroke at a time on 'input' and complete on 'change' - and not for the rest. A checkbox or
      // radio fires both events for one click with the same value each time, so forwarding those would hand a mode
      // two events for one act: the first cut of this fix did exactly that, and the metronome's sound and flash
      // toggles began saving twice and re-rendering twice per click.
      var TYPED = { text: 1, number: 1, search: 1, tel: 1, url: 1, email: 1, password: 1, date: 1, time: 1 };
      document.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t) return;
        if (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return onInput(ev);
        if (t.tagName === 'INPUT' && TYPED[t.type]) return onInput(ev);
      });
      root.addEventListener('resize', function () { A.widgets.refit(); });
      var nav = A.prefs.nav;
      if (A.isObj(nav) && nav.game && nav.mode && A.modes[nav.mode] && A.modes[nav.mode].games.indexOf(nav.game) !== -1) { A.screen = 'mode'; A.game = nav.game; A.mode = nav.mode; }
      render();
      A.installBridge();
      A.ready = true;
      A.post({ type: 'ready' });
    } catch (e) { A.fatal(e, 'boot'); try { A.installBridge(); A.post({ type: 'ready' }); } catch (e2) { /* bridge failed too */ } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
