// A psr script must name the machine and the ROM it was measured on.
//
// WHY THIS TEST EXISTS. On 2026-09-20 the owner ran the Crystal route four times and missed four times,
// on two separate causes, and neither was visible anywhere in the app:
//   - three attempts on Crystal revision 1.1 (sha1 f2f52230...) against a table derived on 1.0 (f4cd194b...);
//   - then one on a plain Game Boy Color against a table derived on GBA silicon. Replaying their own recorded
//     inputs through the derivation harness reproduced their Trainer IDs EXACTLY in gbc mode (37552, 42005,
//     62238, 34983) and gave completely different ones in gbp mode - and the menu and both backouts land on
//     the SAME frames in both, so there was no symptom to notice.
// The card said neither thing. It has to.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Psr = require(path.join(__dirname, '..', '..', 'src', 'offline', 'tid-helper', 'page-gen2-psr.js'));
const D = { gen2psr: require(path.join(__dirname, '..', '..', '..', 'src', 'lib', 'shiny', 'data', 'gen2-psr.json')) };

function script(game, tid) {
  const r = Psr.routeFor(D, tid, game, 'gbp', 'days0');
  return Psr.scriptLines(D, r).join('\n');
}

test('the Crystal script names the console and quotes the ROM sha1 from the data', () => {
  const m = Psr.meth(D, 'crystal');
  const s = script('crystal', 28489);
  assert.ok(m.rom_sha1, 'crystal must have a rom_sha1 for this test to mean anything');
  assert.ok(s.includes(m.rom_sha1), 'the script must quote the ROM sha1');
  assert.ok(s.includes(m.bios_sha1), 'the script must quote the boot ROM sha1');
  assert.ok(/Game Boy Player/.test(s), 'the script must name the console');
  // the console line must say what is NOT covered, because that is the mistake actually made
  assert.ok(/Game Boy Color is not that machine/.test(s), 'the script must rule out a plain Game Boy Color by name');
  // and it must say the frames look identical, or a runner will hunt for a symptom that does not exist
  assert.ok(/SAME frames/.test(s), 'the script must say the frame numbers agree on both machines');
});

test('the sha1 is the data’s, not a literal baked into the page', () => {
  const m = Psr.meth(D, 'crystal');
  const real = m.rom_sha1;
  const fake = 'a'.repeat(40);
  try {
    m.rom_sha1 = fake;
    const s = script('crystal', 28489);
    assert.ok(s.includes(fake), 'the script must quote whatever the data says');
    assert.ok(!s.includes(real), 'the real sha1 must not survive when the data changes: it would be hard-coded');
  } finally { m.rom_sha1 = real; }
});

test('a table with no rom_sha1 states the absence instead of going quiet, and still renders', () => {
  const m = Psr.meth(D, 'gold');
  assert.strictEqual(m.rom_sha1, null, 'gold ships without a rom_sha1 - that is the case under test');
  const s = script('gold', 100);   // any covered Gold Trainer ID; the point is the absent sha1, not the route
  assert.ok(/DOES NOT RECORD WHICH ROM/.test(s), 'the absence must be stated in words');
  assert.ok(!/sha1 null|sha1 undefined/.test(s), 'it must not print a null sha1');
  assert.ok(s.length > 400, 'the rest of the script must still be produced');
});

test('hardware() refuses a table that cannot name its machine', () => {
  const m = Psr.meth(D, 'crystal');
  const real = m.console_name;
  try {
    m.console_name = '';
    assert.throws(() => Psr.hardware(m), /console_name/, 'a nameless machine must be fatal, not defaulted');
    m.console_name = real;
    assert.doesNotThrow(() => Psr.hardware(m));
  } finally { m.console_name = real; }
});

test('every shipped psr table names a console', () => {
  for (const game of Object.keys(D.gen2psr.games)) {
    const m = Psr.meth(D, game);
    const hw = Psr.hardware(m);
    assert.ok(hw.console.length > 10, game + ' must name its console');
    assert.ok(Psr.consoleShort(hw).length > 3, game + ' must have a short console name for the script');
  }
});
