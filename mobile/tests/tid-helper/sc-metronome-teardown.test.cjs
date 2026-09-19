// The teardown contract, pinned.
//
// The page tears a mode down by calling A.widgets.stopAll() and rewriting #main. That stops the cue
// engine, which knows nothing about the SC Metronome's own loop - so without the wrapper below, pressing
// Back left a metronome beeping forever with a full-screen flash overlay still parented to document.body
// and no Stop control anywhere on screen. That is the one defect in this tool that could actually hurt
// somebody, so it gets a test that fails loudly rather than a comment.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers.cjs');

const MODULE = path.join(H.PAGE_DIR, 'page-sc-metronome.js');

function loadWithFakeApp() {
  // a minimal stand-in for the page app, enough for the module's UI half to install itself
  const calls = { registered: null, innerStopAll: 0 };
  const prefs = {};
  const A = {
    esc: (s) => String(s),
    pref: (sec, k, d) => (prefs[sec + '.' + k] === undefined ? d : prefs[sec + '.' + k]),
    setPref: (sec, o) => { for (const k of Object.keys(o)) prefs[sec + '.' + k] = o[k]; },
    D: { gen1: { games: {}, platforms: {}, defaults: {}, reset_models: {} }, gen2: { games: {} } },
    G1: { resetInterval: () => { throw new Error('not used'); } },
    Cue: { arm() { }, ctx: null },
    $: () => null,
    fmtMs: (n) => String(n),
    card: (s) => s, choices: () => '', select: () => '',
    widgets: { stopAll: function () { calls.innerStopAll++; } },
    registerMode: (m) => { calls.registered = m; },
  };
  global.TidHelperApp = A;
  global.document = { createElement: () => ({ setAttribute() { }, className: '' }), body: { appendChild() { }, removeChild() { } } };
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => { };
  delete require.cache[require.resolve(MODULE)];
  const M = require(MODULE);
  return { M, A, calls };
}

function cleanup() {
  delete global.TidHelperApp; delete global.document;
  delete global.requestAnimationFrame; delete global.cancelAnimationFrame;
  delete require.cache[require.resolve(MODULE)];
}

test('the module wraps the shared stopAll, so every existing teardown path stops this loop too', () => {
  const { A, calls } = loadWithFakeApp();
  try {
    assert.equal(A.widgets.__scmWrapped, true, 'stopAll was wrapped');
    assert.doesNotThrow(() => A.widgets.stopAll(), 'the wrapper survives being called with no run active');
    assert.equal(calls.innerStopAll, 1, 'and it still calls through to the original (the cue engine must still stop)');
  } finally { cleanup(); }
});

test('the wrap is idempotent: loading twice does not nest the wrapper', () => {
  const { A } = loadWithFakeApp();
  try {
    const wrapped = A.widgets.stopAll;
    // simulate the module being evaluated again against the same app object
    delete require.cache[require.resolve(MODULE)];
    require(MODULE);
    assert.equal(A.widgets.stopAll, wrapped, 'the second load left the existing wrapper alone');
  } finally { cleanup(); }
});

test('the mode registers for exactly the six games it serves, and no Gen 3 game', () => {
  const { calls } = loadWithFakeApp();
  try {
    assert.ok(calls.registered, 'registerMode was called');
    assert.equal(calls.registered.id, 'sc-metronome');
    assert.deepEqual(calls.registered.games, ['red', 'blue', 'yellow', 'gold', 'silver', 'crystal']);
    for (const g of ['ruby', 'sapphire', 'emerald', 'firered', 'leafgreen']) {
      assert.ok(!calls.registered.games.includes(g), g + ' must not offer a save-corruption metronome');
    }
  } finally { cleanup(); }
});

test('a game with no model reports that nothing was measured, rather than a number', () => {
  const { calls } = loadWithFakeApp();
  try {
    const line = calls.registered.line('crystal');
    assert.match(line, /nothing measured|capture your own/i);
    assert.ok(!/\d+(\.\d+)?\s*ms/.test(line), 'and it quotes no milliseconds: ' + line);
  } finally { cleanup(); }
});
