// gen5.test.cjs - Black / White / Black 2 / White 2.
//
// Gen 5 is the only mode in this app whose answer is console-specific: the boot seed is a SHA-1 over a
// message containing the console's MAC address and three per-console timing constants, so an uncalibrated
// profile is somebody else's console and every number computed on it is wrong. What has to hold:
//   1. a pinned seed vector, because there is no table and no sweep - the transcription IS the methodology;
//   2. every row the search returns really holds the requested Trainer ID;
//   3. calibration CLOSES THE LOOP: given a Trainer ID produced by a known profile, it recovers that profile;
//   4. a calibration range that would lock the page up is refused before it starts, not after;
//   5. buttonNames() is treated as the string it returns (the site's React tab calls .join() on it and would
//      throw for any non-empty button mask - that bug must not be ported here).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers.cjs');
const D = H.data();
const M = H.page('page-gen5.js');
const G5 = H.engines().G5;

const MAC = '00:09:BF:11:22:33';
const WHEN = { year: 2026, month: 9, day: 16, hour: 12, minute: 0, second: 0 };
function profile(over) {
  return M.profileFrom(D, (over && over.game) || 'white', Object.assign({
    language: 'english', dsType: 'ds', mac: MAC, timer0Min: 0xBBD, timer0Max: 0xBBD,
    vcount: 0x5A, vframe: 5, gxstat: 6,
  }, over || {}));
}

test('the pinned boot-seed vector still holds', () => {
  // White, English, DS, MAC 00:09:BF:11:22:33, VFrame 5, GxStat 6, Timer0 0xBBD, VCount 0x5A,
  // 2026-09-16 12:00:00, no buttons. If this moves, the transcription changed and everything else is void.
  const b = M.bootRows(profile(), WHEN, 0xBBD, 3);
  assert.equal(G5.hex64(b.seed), '0x0b5a83ce6db946ea');
  assert.equal(b.base, 29, 'Black/White: 2 plus three probability-table passes');
  assert.deepStrictEqual({ tid: b.rows[0].tid, sid: b.rows[0].sid }, { tid: 32783, sid: 44360 });
  assert.equal(b.rows[0].advances, 29);
  // and the data file must carry the same vector in its own words, so the claim is checkable from the data
  assert.match(M.model(D).validation, /0x0b5a83ce6db946ea/);
  assert.match(M.model(D).validation, /32783/);
});

test('Black 2 / White 2 advance differently, and the data says which family each game is', () => {
  const bw = M.bootRows(profile({ game: 'white' }), WHEN, 0xBBD, 0);
  const bw2 = M.bootRows(profile({ game: 'white2' }), WHEN, 0xBBD, 0);
  assert.notEqual(bw.base, bw2.base, 'BW and B2W2 do not start the ID draw at the same advance');
  assert.equal(M.game(D, 'white').family, 'bw');
  assert.equal(M.game(D, 'white2').family, 'bw2');
  assert.equal(Object.keys(M.model(D).games).length, 4);
});

test('every boot second the search returns really holds that Trainer ID', () => {
  const p = profile();
  const want = M.bootRows(p, WHEN, 0xBBD, 0).rows[0].tid;
  const hits = M.targets(D, p, want, null, WHEN);
  assert.ok(hits.length >= 1, 'the second that produced it must be found');
  for (const h of hits) {
    assert.equal(h.tid, want);
    assert.ok(h.second >= 0 && h.second <= 59);
    const b = M.bootRows(p, Object.assign({}, WHEN, { second: h.second }), h.timer0, 3);
    assert.ok(b.rows.some((r) => r.tid === want), 'recomputing that second does not reproduce the Trainer ID');
  }
  assert.throws(() => M.targets(D, p, 70000, null, WHEN), /0\.\.65535/);
});

test('calibration closes the loop: a Trainer ID recovers the profile that made it', () => {
  // the strongest check available without a DS. Take a known profile, produce a Trainer ID from it, then
  // ask calibration to find the console - it must report the Timer0, VCount and VFrame it started from.
  const p = profile();
  const got = M.bootRows(p, WHEN, 0xBBD, 0).rows[0].tid;
  const out = M.calibrate(D, p, got, null, WHEN, {
    timer0Min: 0xBBD - 2, timer0Max: 0xBBD + 2, vcountMin: 0x5A, vcountMax: 0x5A,
    vframeMin: 4, vframeMax: 6, secondMin: 0, secondMax: 59,
  });
  assert.ok(out.length >= 1, 'calibration found nothing for a Trainer ID its own profile produced');
  assert.ok(out.some((r) => r.timer0 === 0xBBD && r.vcount === 0x5A && r.vframe === 5),
    // the seed is a BigInt, which JSON.stringify refuses; an assertion message is evaluated eagerly, so
    // stringifying the raw rows here throws before the assertion is even checked
    'calibration did not recover the profile it started from: '
    + out.slice(0, 3).map((r) => r.timer0 + '/' + r.vcount + '/' + r.vframe).join(' '));
});

test('a calibration range that would lock the page up is refused before it starts', () => {
  const p = profile();
  const cost = M.calCost({ timer0Min: 0xC00, timer0Max: 0xD00, vcountMin: 0x50, vcountMax: 0x70,
                           vframeMin: 0, vframeMax: 9, secondMin: 0, secondMax: 59 });
  assert.equal(cost.cells, 257 * 33 * 10 * 60);
  assert.ok(cost.cells > M.CAL_CELL_BUDGET, 'the site defaults really are over budget: ' + cost.cells);
  assert.throws(() => M.calibrate(D, p, 1, null, WHEN, { timer0Min: 0xC00, timer0Max: 0xD00,
    vcountMin: 0x50, vcountMax: 0x70, vframeMin: 0, vframeMax: 9, secondMin: 0, secondMax: 59 }),
    /lock the page up|Narrow/);
  assert.throws(() => M.calCost({ timer0Min: 10, timer0Max: 1, vcountMin: 0, vcountMax: 0,
    vframeMin: 0, vframeMax: 0, secondMin: 0, secondMax: 0 }), /backwards/);
});

test('buttonNames returns a string and is used as one', () => {
  // gen5.js returns names.join("+"); the site's React tab then calls .join('+') on that string, which throws
  // for any non-empty mask and survives only because it hardcodes an empty one. Not ported.
  assert.equal(typeof G5.buttonNames(0), 'string');
  assert.equal(typeof G5.buttonNames(1), 'string');
  assert.equal(M.buttonsText(0), 'None');
  assert.equal(typeof M.buttonsText(1), 'string');
  assert.ok(M.buttonsText(1).length > 0);
});

test('the MAC address is accepted however it is typed, and refused when it is not one', () => {
  const want = BigInt('0x0009BF112233');
  for (const s of ['00:09:BF:11:22:33', '0009BF112233', '00-09-bf-11-22-33', '00 09 bf 11 22 33']) {
    assert.equal(M.parseMac(s), want, 'failed to parse ' + s);
  }
  for (const s of ['', 'nope', '0009BF1122', '0009BF11223344']) assert.equal(M.parseMac(s), null, s + ' should not parse');
  assert.throws(() => M.profileFrom(D, 'white', { mac: 'nope', timer0Min: 1, timer0Max: 1, vcount: 1, vframe: 1, gxstat: 1 }), /MAC address/);
  assert.throws(() => M.profileFrom(D, 'white', { mac: MAC, timer0Min: 10, timer0Max: 1, vcount: 1, vframe: 1, gxstat: 1 }), /Timer0 range/);
});

test('the data says plainly that this needs a profile and has no hardware sample', () => {
  const m = M.model(D);
  assert.match(m.status, /NOT usable without a console profile/);
  assert.match(m.status + m.validation, /NO HARDWARE SAMPLE/);
  assert.match(m.not_derived, /Nothing here is this project's own derivation/);
  assert.match(m.defaults_note, /melonDS|emulator/);
  assert.match(m.profile.cgear, /C-Gear must be OFF/i);
  assert.match(m.row_note, /has not verified/);
  assert.match(JSON.stringify(m.credits), /PokeFinder/);
  assert.match(m.credits[0].who, /community/i);
});
