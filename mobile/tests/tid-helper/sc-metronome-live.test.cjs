// The SC Metronome's LIVE half: the two number fields, what an adjustment does to a beat that is already
// playing, and whether the tap capture measures the rhythm the card asks the player to tap.
//
// sc-metronome.test.cjs covers the pure functions and sc-metronome-teardown.test.cjs covers the stopAll
// wrapper. Neither could see the three defects below, because all three live in the join between the
// module's event handlers, the page's render() and the AudioContext clock. So this file stands the module
// up against a stand-in for all three: an element registry scraped out of the HTML the mode renders, an
// AudioContext whose clock is advanced by hand, and a render() that does what page-render.js's render()
// does - A.widgets.stopAll() first, then the mode's own render.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers.cjs');

const MODULE = path.join(H.PAGE_DIR, 'page-sc-metronome.js');

// ---- the stand-in browser ---------------------------------------------------------------------------

function El(attrs) {
  attrs = attrs || {};
  this.id = attrs.id || '';
  this.value = attrs.value === undefined ? '' : attrs.value;
  this.checked = !!attrs.checked;
  this.disabled = !!attrs.disabled;
  this.textContent = attrs.textContent || '';
  this.className = '';
  this.tagName = attrs.tagName || 'DIV';
  this.parentNode = null;
}
El.prototype.setAttribute = function () { };
El.prototype.closest = function () { return null; };

// every id="..." in the rendered HTML, with the value / checked / disabled the markup gives it
function scrape(html) {
  const out = {};
  const tagRe = /<(input|select|p|span|button|div|label)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toUpperCase(), attrs = m[2];
    const idm = /\bid="([^"]+)"/.exec(attrs);
    if (!idm) continue;
    const vm = /\bvalue="([^"]*)"/.exec(attrs);
    const el = new El({ id: idm[1], value: vm ? vm[1] : '', checked: /\bchecked\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), tagName: tag });
    if (tag === 'SELECT') {
      const body = html.slice(m.index, html.indexOf('</select>', m.index) + 1);
      const sel = /<option value="([^"]*)" selected>/.exec(body);
      el.value = sel ? sel[1] : '';
    }
    if (tag === 'P' || tag === 'SPAN') {
      const tail = html.slice(m.index + m[0].length);
      const end = tail.indexOf('</' + m[1]);
      if (end >= 0) el.textContent = tail.slice(0, end).replace(/<[^>]*>/g, '');
    }
    out[idm[1]] = el;
  }
  return out;
}

function makeCtx() {
  const ctx = {
    currentTime: 0, state: 'running', destination: {}, nodes: [],
    createGain() { return { gain: { setValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect() { } }; },
    createOscillator() {
      const o = {
        frequency: { value: 0 }, type: '', connect() { }, startAt: null, stopAt: null,
        start(t) { this.startAt = t; },
        stop(t) { this.stopAt = (t === undefined ? ctx.currentTime : t); },
      };
      ctx.nodes.push(o);
      return o;
    },
  };
  return ctx;
}

function boot() {
  const prefs = {};
  const log = { renders: 0, stopAll: 0, setPref: 0 };
  const ctx = makeCtx();
  const timers = [];
  let els = {};

  const A = {
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pref: (sec, k, d) => (prefs[sec + '.' + k] === undefined ? d : prefs[sec + '.' + k]),
    setPref: (sec, o) => { log.setPref++; for (const k of Object.keys(o)) { if (o[k] === undefined) delete prefs[sec + '.' + k]; else prefs[sec + '.' + k] = o[k]; } },
    prefs: {},
    D: H.data(),
    G1: H.engines().G1,
    Cue: { arm() { }, ctx },
    $: (id) => els[id] || null,
    fmtMs: (n) => Number(n).toFixed(1) + ' ms',
    card: (inner) => '<div class="card">' + inner + '</div>',
    choices: (name, items) => items.map((it) => '<button type="button" data-choice="' + name + '" data-id="' + it.id + '"></button>').join(''),
    select: (id, items, value, label) => '<label class="field">' + (label || '') + '<select id="' + id + '">' +
      items.map((it) => '<option value="' + it.id + '"' + (it.id === value ? ' selected' : '') + '>' + it.title + '</option>').join('') + '</select></label>',
    widgets: { stopAll() { log.stopAll++; }, reset() { } },
    registerMode(m) { A.__mode = m; },
  };

  const saved = { setInterval: global.setInterval, clearInterval: global.clearInterval };
  global.TidHelperApp = A;
  global.document = {
    getElementById: (id) => A.$(id),
    createElement: () => new El({}),
    body: { appendChild(n) { n.parentNode = this; }, removeChild(n) { n.parentNode = null; } },
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => { };
  global.setInterval = (fn) => { timers.push(fn); return timers.length; };
  global.clearInterval = (id) => { if (id && timers[id - 1]) timers[id - 1] = null; };

  delete require.cache[require.resolve(MODULE)];
  require(MODULE);
  const mode = A.__mode;

  // page-render.js's render(), to the letter that matters here: stopAll BEFORE the mode draws itself
  function render(game) {
    log.renders++;
    A.widgets.stopAll(); A.widgets.reset();
    let html = '';
    mode.render({ set innerHTML(h) { html = h; } }, game);
    els = scrape(html);
    return html;
  }
  function fire(ev, game) {
    const r = mode.onEvent(ev, game);
    if (r === 'render') render(game);
    return r;
  }
  const click = (act, game) => fire({ type: 'click', target: { closest: (s) => (s === '[data-scm]' ? { getAttribute: () => act } : null) } }, game);
  function tick(seconds) {
    for (let t = 0; t < seconds - 1e-9; t += 0.025) {
      ctx.currentTime += 0.025;
      timers.forEach((fn) => { if (fn) fn(); });
    }
  }
  const running = () => timers.some((fn) => !!fn);
  const beats = () => ctx.nodes.filter((n) => n.startAt !== null).map((n) => n.startAt);
  function cleanup() {
    delete global.TidHelperApp; delete global.document;
    delete global.requestAnimationFrame; delete global.cancelAnimationFrame;
    global.setInterval = saved.setInterval; global.clearInterval = saved.clearInterval;
    delete require.cache[require.resolve(MODULE)];
  }
  return { A, mode, render, fire, click, tick, ctx, prefs, log, running, beats, cleanup, text: (id) => (els[id] ? els[id].textContent : null), el: (id) => els[id] || null };
}

// The numbers this file reasons about are the shipped ones, read back out of the data, never typed in here.
const G1 = H.data().gen1;
const RI = H.engines().G1.resetInterval(G1.reset_models['gbp-fade'], 'route', null, 0);
const IV_MS = RI.centreMs;                       // the gbp-fade / route preset, 199.2 ms today
const CADENCE_MS = G1.defaults.reset_cadence_s * 1000;   // the data's own attempt spacing
const WAIT_MS = CADENCE_MS - IV_MS;

// a run of taps on the pair rhythm: interval, wait, interval, wait ...
function pairTaps(n, startOnFirstAction) {
  const out = [0];
  let t = 0, nextIsInterval = startOnFirstAction;
  for (let i = 1; i < n; i++) { t += nextIsInterval ? IV_MS : WAIT_MS; out.push(t); nextIsInterval = !nextIsInterval; }
  return out;
}

// ---- FINDING 1: the two number fields ---------------------------------------------------------------

test('only the COMMITTED value reaches the interval: a half-typed number is ignored', () => {
  const h = boot();
  try {
    h.render('red');
    // page-render forwards both events now. "4" on the way to "420" arrives as 'input' and must not stick:
    // stored, it would be clamped to the 20 ms floor and played as the interval mid-keystroke.
    h.fire({ type: 'input', target: { id: 'scm-interval', value: '4' } }, 'red');
    assert.equal(h.prefs['scmetro.intervalMs.red'], undefined, "'input' must not commit");
    h.fire({ type: 'change', target: { id: 'scm-interval', value: '420' } }, 'red');
    assert.equal(h.prefs['scmetro.intervalMs.red'], 420, "'change' is the commit");
    h.fire({ type: 'input', target: { id: 'scm-cadence', value: '3' } }, 'red');
    assert.equal(h.prefs['scmetro.cadenceS.red'], undefined, "'input' must not commit the cadence either");
    h.fire({ type: 'change', target: { id: 'scm-cadence', value: '3.5' } }, 'red');
    assert.equal(h.prefs['scmetro.cadenceS.red'], 3.5);
  } finally { h.cleanup(); }
});

test('committing a number updates the card in place: no re-render, so the field and the caret survive', () => {
  const h = boot();
  try {
    h.render('red');
    const before = h.log.renders;
    const r = h.fire({ type: 'change', target: { id: 'scm-interval', value: '420' } }, 'red');
    assert.equal(r, null, 'the handler must not ask the page to rebuild the mode');
    assert.equal(h.log.renders, before, 'and the mode was not rebuilt');
    assert.equal(h.el('scm-interval').value, '420', 'the field still shows the committed value');
    assert.match(h.text('scm-flashplan'), /pattern as it stands/, 'the derived flash plan was repainted in place');
  } finally { h.cleanup(); }
});

test('a clamped number is written back, so the field never shows one thing while the beat plays another', () => {
  const h = boot();
  try {
    h.render('red');
    h.fire({ type: 'change', target: { id: 'scm-interval', value: '5' } }, 'red');   // under the floor
    const M = require(MODULE);
    assert.equal(h.prefs['scmetro.intervalMs.red'], M.MIN_INTERVAL_MS);
    assert.equal(h.el('scm-interval').value, String(M.MIN_INTERVAL_MS));
  } finally { h.cleanup(); }
});

test('an emptied cadence falls back to the data, not to a number written into this file', () => {
  const h = boot();
  try {
    h.render('red');
    h.fire({ type: 'change', target: { id: 'scm-cadence', value: '' } }, 'red');
    assert.equal(h.prefs['scmetro.cadenceS.red'], undefined, 'the preference is cleared, not set to 0');
    assert.equal(h.el('scm-cadence').value, String(G1.defaults.reset_cadence_s), 'and the field shows the data\'s reset_cadence_s');
  } finally { h.cleanup(); }
});

test('one user action on a select or a checkbox is handled once, not twice', () => {
  const h = boot();
  try {
    h.render('red');
    // A select and a checkbox each fire 'input' AND 'change' for a single click, and the page delegates
    // both. Handling both committed the same value twice and re-timed the beat twice per click.
    for (const [ev, count] of [
      [{ id: 'scm-mode', value: 'even' }, 'mode'],
      [{ id: 'scm-sound', checked: false }, 'sound'],
      [{ id: 'scm-flash-consent', checked: true }, 'consent'],
    ]) {
      const before = h.log.setPref, r0 = h.log.renders;
      h.fire({ type: 'input', target: ev }, 'red');
      h.fire({ type: 'change', target: ev }, 'red');
      assert.equal(h.log.setPref - before, 1, count + ': the second event of the pair must be a no-op');
      assert.equal(h.log.renders - r0, 0, count + ': and neither event rebuilds the mode');
    }
  } finally { h.cleanup(); }
});

// ---- FINDING 2: an adjustment must re-time the beat, not end it -------------------------------------

test('an adjustment re-times a running beat instead of stopping it', () => {
  const h = boot();
  try {
    h.render('red');
    h.click('start', 'red');
    h.tick(5);
    assert.ok(h.running(), 'the loop is running to begin with');
    assert.match(h.text('scm-status'), /^Running at /);
    const before = h.beats().length;

    // This is the shape of the defect: restartIfRunning() started a fresh loop and then the 'render' the
    // handler returned ran page-render's render(), which begins with the A.widgets.stopAll() this module
    // wraps - so the adjustment stopped the beat it had just restarted.
    h.click('up', 'red');
    assert.ok(h.running(), 'the loop is still running after the nudge');
    assert.match(h.text('scm-status'), /^Running at /, 'and the status line still says so');
    h.tick(5);
    assert.ok(h.beats().length > before, 'and it went on placing beats');
  } finally { h.cleanup(); }
});

test('every adjustment keeps the beat, not just the nudge', () => {
  const adjust = [
    ['-1 frame', (h) => h.click('down', 'red')],
    ['back to the preset', (h) => h.click('reset', 'red')],
    ['a typed interval', (h) => h.fire({ type: 'change', target: { id: 'scm-interval', value: '420' } }, 'red')],
    ['a typed cadence', (h) => h.fire({ type: 'change', target: { id: 'scm-cadence', value: '3' } }, 'red')],
    ['the rhythm', (h) => h.fire({ type: 'change', target: { id: 'scm-mode', value: 'even' } }, 'red')],
    ['muting', (h) => h.fire({ type: 'change', target: { id: 'scm-sound', checked: false } }, 'red')],
  ];
  for (const [what, act] of adjust) {
    const h = boot();
    try {
      h.render('red');
      h.click('start', 'red');
      h.tick(5);
      act(h);
      assert.ok(h.running(), what + ' stopped the beat');
      assert.match(h.text('scm-status'), /^Running at /, what + ' left the status line reading ' + JSON.stringify(h.text('scm-status')));
    } finally { h.cleanup(); }
  }
});

test('re-timing keeps the phase: the attempt grid does not move and no beat is cancelled', () => {
  const h = boot();
  try {
    h.render('red');
    h.click('start', 'red');
    h.tick(5);
    h.click('up', 'red');
    h.tick(6);
    const starts = h.beats();
    const leads = starts.filter((_, i) => i % 2 === 0), seconds = starts.filter((_, i) => i % 2 === 1);
    for (let i = 1; i < leads.length; i++) {
      assert.ok(Math.abs((leads[i] - leads[i - 1]) - G1.defaults.reset_cadence_s) < 1e-9,
        'attempt ' + i + ' moved off the cadence grid: ' + (leads[i] - leads[i - 1]));
    }
    const gaps = seconds.map((t, i) => (t - leads[i]) * 1000);
    const M = require(MODULE);
    assert.ok(Math.abs(gaps[0] - IV_MS) < 1e-6, 'it started on the preset');
    assert.ok(Math.abs(gaps[gaps.length - 1] - M.nudge(IV_MS, 1)) < 1e-6, 'and ended a whole frame longer');
    assert.equal(h.ctx.nodes.filter((n) => n.stopAt !== null && n.stopAt <= n.startAt).length, 0,
      'nothing already on the audio clock had to be thrown away');
  } finally { h.cleanup(); }
});

test('re-timing does not weaken the teardown: Back still stops the beat', () => {
  const h = boot();
  try {
    h.render('red');
    h.click('start', 'red');
    h.tick(2);
    h.click('up', 'red');
    assert.ok(h.running());
    h.A.widgets.stopAll();     // what Back, a mode switch and the storyboard's Stop all go through
    assert.ok(!h.running(), 'the wrapper must still stop this loop');
  } finally { h.cleanup(); }
});

test('an adjustment that leaves nothing to play stops the beat rather than playing on', () => {
  const h = boot();
  try {
    h.render('crystal');      // Gen 2: no model, so no preset to fall back to
    h.fire({ type: 'change', target: { id: 'scm-interval', value: '300' } }, 'crystal');
    h.click('start', 'crystal');
    h.tick(2);
    assert.ok(h.running());
    h.fire({ type: 'change', target: { id: 'scm-interval', value: '' } }, 'crystal');
    assert.ok(!h.running(), 'with the interval cleared and nothing modelling this game there is no beat');
  } finally { h.cleanup(); }
});

// ---- FINDING 3: the capture has to measure the rhythm the card asks for ----------------------------

test('the pair rhythm alternates, so a median over every gap is not the interval', () => {
  const M = require(MODULE);
  // What the old arithmetic did, reconstructed: the plain median of all the gaps of a pair-rhythm run.
  const plainMedian = (stamps) => {
    const g = [];
    for (let i = 1; i < stamps.length; i++) g.push(stamps[i] - stamps[i - 1]);
    g.sort((a, b) => a - b);
    const mid = Math.floor(g.length / 2);
    return g.length % 2 ? g[mid] : (g[mid - 1] + g[mid]) / 2;
  };
  assert.ok(plainMedian(pairTaps(7, true)) / IV_MS > 4.5, 'the plain median was about five times the interval');
  assert.ok(plainMedian(pairTaps(6, false)) / IV_MS > 8.5, 'or nine times it, on a run that started on the second action');

  // 7 and 9 are the counts the old plain median got wrong by a factor of five; 6, 8 and 12 it happened to
  // get right, which is exactly why nothing caught this.
  for (const n of [7, 9, 6, 8, 12]) {
    const c = M.capture(pairTaps(n, true), 'pair');
    assert.ok(c.ok, n + ' taps is a usable pair run');
    assert.ok(Math.abs(c.medianMs - IV_MS) < 1e-9, n + ' taps gave ' + c.medianMs + ' ms, not the interval ' + IV_MS);
    assert.ok(Math.abs(c.waitMs - WAIT_MS) < 1e-9, 'and the wait between attempts is reported alongside it');
  }
});

test('the even rhythm still measures every gap', () => {
  const M = require(MODULE);
  const c = M.capture([0, 200, 399, 601], 'even');
  assert.equal(c.medianMs, 200);
  assert.equal(c.waitMs, null, 'there is no untapped wait in an even tick');
});

test('a pair run needs twice the taps, because only half its gaps are the interval', () => {
  const M = require(MODULE);
  assert.equal(M.minTaps('pair'), 6);
  assert.equal(M.minTaps('even'), 4);
  // four taps on the pair rhythm is two samples of the interval, and one slip would then be half the answer
  assert.equal(M.capture(pairTaps(4, true), 'pair').ok, false);
  assert.equal(M.capture(pairTaps(5, true), 'pair').ok, false);
  assert.equal(M.capture(pairTaps(6, true), 'pair').ok, true);
  assert.equal(M.capture([0, 200, 400, 600], 'even').ok, true);
});

test('the instruction under the tap button says what the arithmetic measures', () => {
  const M = require(MODULE);
  const h = boot();
  try {
    h.render('red');
    const pair = h.text('scm-capmsg');
    assert.match(pair, new RegExp('at least ' + M.minTaps('pair') + ' taps', 'i'), 'pair: ' + pair);
    assert.ok(!/at least four taps/i.test(pair), 'pair: four taps is not enough and must not be asked for');
    assert.match(pair, /RESET then A/, 'pair: it names the two actions the model gives - ' + pair);
    assert.match(pair, /wait between attempts untapped/i, 'pair: and says the wait is not tapped');

    h.fire({ type: 'change', target: { id: 'scm-mode', value: 'even' } }, 'red');
    const even = h.text('scm-capmsg');
    assert.match(even, new RegExp('at least ' + M.minTaps('even') + ' taps', 'i'), 'even: ' + even);
    assert.match(even, /every gap is the interval/i, 'even: ' + even);
  } finally { h.cleanup(); }
});

test('"Use the tapped interval" takes the number the card quoted', () => {
  const h = boot();
  try {
    h.render('red');
    const stamps = pairTaps(7, true);   // seven taps: the count the plain median read as five times the gap
    for (const ts of stamps) h.fire({ type: 'click', timeStamp: ts + 1, target: { closest: (s) => (s === '[data-scm]' ? { getAttribute: () => 'tap' } : null) } }, 'red');
    const quoted = h.text('scm-capmsg');
    assert.match(quoted, /^Interval /, quoted);
    h.click('usetaps', 'red');
    const taken = h.prefs['scmetro.intervalMs.red'];
    assert.ok(Math.abs(taken - IV_MS) < 1e-9, 'took ' + taken + ' ms for a run tapped at ' + IV_MS + ' ms');
    assert.ok(quoted.indexOf('Interval ' + Number(taken).toFixed(1) + ' ms') === 0,
      'and the card had quoted that same number: ' + quoted);
  } finally { h.cleanup(); }
});

test('a run started on the second action is visible rather than silently nine times too long', () => {
  const h = boot();
  try {
    h.render('red');
    const stamps = pairTaps(8, false);   // started on A, so the first gap is the wait
    for (const ts of stamps) h.fire({ type: 'click', timeStamp: ts + 1, target: { closest: (s) => (s === '[data-scm]' ? { getAttribute: () => 'tap' } : null) } }, 'red');
    const msg = h.text('scm-capmsg');
    assert.ok(msg.indexOf(Number(WAIT_MS).toFixed(1) + ' ms') !== -1, 'the wait it actually tapped is on screen: ' + msg);
    assert.ok(msg.indexOf(Number(IV_MS).toFixed(1) + ' ms') !== -1, 'and so is the interval it skipped: ' + msg);
    assert.match(msg, /started on/i, 'and it is named as a mis-started run, not left as two numbers to compare: ' + msg);
    // it is also REFUSED. The wait between attempts is always the longer of the two, so a run that reads them
    // the other way round is definitely a beat out, and installing it would put the one number this card exists
    // to get right about nine times too high.
    // 'scmetro' is the mode's pref section; reading the wrong one would compare undefined with undefined and
    // pass without testing anything, so the sentinel below proves the read is live before the click
    h.A.setPref('scmetro', { 'intervalMs.red': 123.4 });
    const before = h.A.pref('scmetro', 'intervalMs.red');
    assert.equal(before, 123.4, 'the pref read is live');
    h.fire({ type: 'click', timeStamp: 1, target: { closest: (s) => (s === '[data-scm]' ? { getAttribute: () => 'usetaps' } : null) } }, 'red');
    assert.deepEqual(h.A.pref('scmetro', 'intervalMs.red'), before, 'a mis-started run is not taken as the interval');
  } finally { h.cleanup(); }
});
