// sign-toggle.test.cjs - the +/- button on every field that can legitimately go negative.
//
// WHY. A phone's numeric keypad has no minus key. `inputmode="numeric"` asks for exactly that keypad, and
// the Gen 2 psr correction used it, so on the device this app is built for the field could not be taken
// below zero at all - the only way down was tapping "1 frame earlier" ten or twenty times. It went
// unnoticed because a desktop browser shows a full keyboard. Reported 2026-09-20 by the owner, who had
// been told to type +326 and could not have typed -326 if the advice had gone the other way.
//
// The button flips the field and fires the field's own 'input' event, so persistence stays wherever it
// already was. That is the property worth pinning: a page cannot gain a sign button that fails to save.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');
const src = path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

// Fields that take a sign, and the page that draws each. Adding a signed field without its button is the
// regression this list exists to catch, so it is written out rather than discovered.
const SIGNED = [
  ['page-gen2-psr.js', 'g2psr-corr'],       // cue correction (ms): + cues earlier
  ['page-gen1-buffer.js', 'buffer-corr'],   // cue correction (ms)
  ['page-render.js', 'set-visual'],         // visual offset (ms): + draws later
  ['page-gen1-timed.js', 'g1-reset-adjust'],// reset adjustment (frames)
];

test('every signed field has a sign button naming it', () => {
  for (const [file, id] of SIGNED) {
    const txt = read(file);
    assert.ok(txt.includes("id=\"" + id + "\""), file + ' no longer draws ' + id);
    assert.ok(new RegExp("signButtonHtml\\(\\s*'" + id + "'").test(txt),
      file + ': ' + id + ' can be negative but has no +/- button, so a phone cannot reach negative values');
  }
  // the calibration override is built from a caller-supplied id prefix
  assert.ok(/signButtonHtml\(id \+ '-override'\)/.test(read('page-widgets.js')),
    'the calibration override has no +/- button');
});

test('no field with a non-negative floor gets one', () => {
  // a sign button on "Count-in beeps (min 0)" or "Pairs (min 1)" would offer a value the field rejects
  for (const f of fs.readdirSync(src).filter((x) => /^page-.*\.js$/.test(x))) {
    const txt = read(f);
    const re = /<input[^>]*min="(\d+)"[^>]*id="([^"]+)"|<input[^>]*id="([^"]+)"[^>]*min="(\d+)"/g;
    let m;
    while ((m = re.exec(txt))) {
      const id = m[2] || m[3];
      assert.ok(!new RegExp("signButtonHtml\\(\\s*'" + id + "'").test(txt),
        f + ': ' + id + ' has a non-negative minimum but was given a +/- button');
    }
  }
});

test('the click is handled once, centrally, and flips the field rather than saving behind its back', () => {
  const r = read('page-render.js');
  assert.ok(/closest\('\[data-sign\]'\)/.test(r), 'page-render.js does not handle [data-sign] clicks');
  assert.ok(/A\.flipSign\(/.test(r), 'the handler must call A.flipSign');
  const a = read('page-app.js');
  assert.ok(/dispatchEvent\(/.test(a), "flipSign must fire the field's own input event, not write prefs itself");
  assert.ok(!/setPref/.test(a.slice(a.indexOf('function flipSign'), a.indexOf('function flipSign') + 500)),
    'flipSign must not persist anything itself - that is the field owner\'s job');
});

test('flippedValue: blanks and zero are values, not things to rewrite', () => {
  const A = H.app();
  assert.strictEqual(A.flippedValue('170'), '-170');
  assert.strictEqual(A.flippedValue('-170'), '170');
  assert.strictEqual(A.flippedValue('326'), '-326');
  assert.strictEqual(A.flippedValue(0.5), '-0.5');
  assert.strictEqual(A.flippedValue('-0.5'), '0.5');
  // blank means "unset" on at least one of these fields; turning it into 0 changes the meaning
  assert.strictEqual(A.flippedValue(''), '');
  assert.strictEqual(A.flippedValue('   '), '');
  assert.strictEqual(A.flippedValue(null), '');
  assert.strictEqual(A.flippedValue(undefined), '');
  // -0 renders as "0", so flipping zero must be a no-op rather than a rewrite
  assert.strictEqual(A.flippedValue('0'), '0');
  // a half-typed value is left alone rather than destroyed
  assert.strictEqual(A.flippedValue('abc'), 'abc');
  // flipping twice is identity for every ordinary value
  for (const v of ['170', '-170', '0.5', '0', '', 'abc']) {
    assert.strictEqual(A.flippedValue(A.flippedValue(v)), v, 'flipping "' + v + '" twice must return it');
  }
});

test('the button markup is a button, carries its target, and is labelled for a screen reader', () => {
  const A = H.app();
  const h = A.signButtonHtml('g2psr-corr');
  assert.ok(/type="button"/.test(h), 'must not submit anything');
  assert.ok(/data-sign="g2psr-corr"/.test(h), 'must name the field it flips');
  assert.ok(/aria-label="/.test(h), 'must be labelled: "+ / -" alone reads as punctuation');
});
