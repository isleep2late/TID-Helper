// cue.test.cjs - the cue schedules the page plays are the engines' own. Run: node --test tests/tid-helper/*.test.cjs
//   1. Gen 1 timed: the page's schedule for GBP offset 358 on the menu anchor and DMG offset 100 on the power-on anchor
//      equals ShinyGen1Tid.schedule(...) called directly with the data's timing / defaults (cue for cue), and the site's
//      methodology choice (methodologyIdFor) and derivation descriptor are the engine's;
//   2. Gen 2: the page's schedule equals ShinyGen2Tid.scheduleGen2 for gold/gbp bin 23 (menu) and gold/gbc bin 23 (power-on);
//   3. Gen 3 SID: the beep cues are the engine's kWindowForCue beeps (count-in tone, A tone last);
//   4. the cue engine's pure parts: visualsFor maps every cue kind, program() fills endT, and the RN-facing prefs / bridge
//      code of page-app.js handles init, queues and a malformed message.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines();

test('Gen 1 timed: the page schedule equals ShinyGen1Tid.schedule for GBP 358 (menu) and DMG 100 (power-on)', () => {
  const T = H.page('page-gen1-timed.js'), G1 = E.G1, g1 = D.gen1;
  const cases = [['gbp', 'menu', 358], ['dmg', 'poweron', 100], ['gse', 'reset', 743]];
  for (const [pk, anchor, offset] of cases) {
    const ctx = T.context(D, G1, 'red', pk);
    assert.equal(ctx.methId, G1.methodologyIdFor(g1, 'red', g1.platforms[pk].family));
    assert.ok(ctx.anchors.includes(anchor), pk + ' offers ' + anchor);
    const corr = g1.defaults.correction_ms[anchor], beeps = g1.defaults.count_in_beeps, sp = g1.defaults.count_in_spacing_s;
    const mine = T.schedule(G1, ctx, anchor, offset, corr, beeps, sp);
    const theirs = G1.schedule(anchor, offset, corr, { family: g1.methodologies[ctx.methId].timing, beeps, spacingS: sp, resetModel: anchor === 'reset' ? g1.reset_models[g1.platforms[pk].reset] : undefined, methodology: g1.methodologies[ctx.methId] });
    assert.deepEqual(mine, theirs, pk + ' ' + anchor + ' ' + offset);
    assert.equal(mine.cues[mine.cues.length - 1].kind, 'A');
    if (anchor === 'menu') assert.ok(Math.abs(mine.tA - (G1.targetSeconds(offset) - corr / 1000)) < 1e-12);
    else assert.ok(Math.abs(mine.tA - (mine.menu + G1.targetSeconds(offset) - corr / 1000)) < 1e-12);
    assert.deepEqual(ctx.derivation, G1.derivationPlatform(g1, 'red', ctx.methId, g1.games.red.default_target_sets), 'the derivation descriptor is the engine\'s');
    assert.deepEqual(T.invertTid(G1, ctx, ctx.table[offset]), G1.invert(ctx.table, ctx.table[offset]));
  }
  const ctx = T.context(D, E.G1, 'red', 'gbp');
  assert.ok(T.routeValid(E.G1, ctx).some((r) => r.offset === 358 && r.tid === 0x4003), 'offset 358 -> $4003 is route-valid on Red GBP');
  const lines = T.protocolLines(E.G1, D, ctx, 'menu', T.schedule(E.G1, ctx, 'menu', 358, 200, 4, 1), { offset: 358, tid: 0x4003 }, 200, 4, 1, { s: (x, d) => x.toFixed(d == null ? 3 : d) + ' s', ms: (x) => x.toFixed(1) + ' ms' });
  assert.ok(lines.length >= 5 && lines.some((l) => l.includes('frames 1300-1475')) && lines.some((l) => l.includes(E.G1.targetSeconds(358).toFixed(3))), 'protocol carries the data\'s frames and the engine\'s seconds');
  // what did you get: a hit at 361 from an aim of 358 is 3 frames late; a duplicate is refused
  const cal = { samples: [], override: null };
  const res = T.submitGot(E.G1, ctx, 'menu', cal, null, 358, 200, 200, String(ctx.table[361]), false, { s: (x) => x + ' s', ms: (x) => x.toFixed(1) + ' ms' }, { menu: 'menu' });
  assert.ok(res.recorded && res.samples.length === 1 && res.samples[0].hit === 361 && res.samples[0].aimed === 358);
  assert.ok(Math.abs(res.samples[0].implied_ms - (200 + E.G1.framesToMs(3))) < 1e-9);
  const dup = T.submitGot(E.G1, ctx, 'menu', { samples: res.samples, override: null }, null, 358, 200, 200, String(ctx.table[361]), false, { s: (x) => x + ' s', ms: (x) => x.toFixed(1) + ' ms' }, { menu: 'menu' });
  assert.ok(!dup.recorded && dup.forceable, 'duplicate refused, forceable');
});

test('Gen 2: the page schedule equals ShinyGen2Tid.scheduleGen2; the context is the engine\'s methodology', () => {
  const T = H.page('page-gen2.js'), G2 = E.G2, g2 = D.gen2;
  for (const [pid, dmg, anchor] of [['gbp', 'dmg', 'menu'], ['gbc', 'dmg', 'poweron'], ['dmg', 'dmg-latestart', 'poweron'], ['gse', 'dmg', 'reset']]) {
    const ctx = T.context(D, E.G1, G2, 'gold', pid, dmg, 'days0');
    assert.equal(ctx.methId, G2.methodologyFor(g2, 'gold', ctx.platformKey).id, pid);
    if (!ctx.anchors.includes(anchor)) continue;
    const corr = g2.defaults.correction_ms[anchor];
    const mine = T.schedule(G2, D, ctx, 23, corr, anchor, 4, 1);
    const theirs = G2.scheduleGen2(g2, ctx.methId, 23, corr, { anchor, beeps: 4, spacingS: 1, resetExtraS: anchor === 'reset' ? E.G1.resetAnchorExtraSeconds(D.gen1.reset_models[g2.platforms[pid].reset]) : undefined });
    assert.deepEqual(mine, theirs, pid + ' ' + anchor);
  }
  const ctx = T.context(D, E.G1, G2, 'crystal', 'gbc', 'dmg', 'days512');
  assert.equal(ctx.state, 'days0', 'Crystal is RTC-immune: its one state');
  const hits = T.hitsAllStates(G2, D, T.context(D, E.G1, G2, 'silver', 'gbp', 'dmg', 'days0'));
  assert.deepEqual(hits, G2.targetsAllStates(g2, 'silver', 'gbp', G2.targetSetsFor(g2, 'silver', null)));
  const look = G2.lookup(g2, 'gold', 'gbp', 'days0', 40);
  const cands = T.invertTyped(G2, D, T.context(D, E.G1, G2, 'gold', 'gbp', 'dmg', 'days0'), look.tid, look.lid);
  assert.ok(cands.some((c) => c.bin === 40));
});

test('Gen 3 SID: beep cues are the engine\'s window beeps; candidates are sidCandidates over the engine\'s k range', () => {
  const S = H.page('page-gen3-sid.js'), G1 = E.G1;
  const ctx = S.context(D, G1, 'emerald', null, 'fast', 1, 30);
  assert.equal(ctx.error, null);
  assert.equal(ctx.kFixed, G1.kFixed(ctx.model, 1, 'fast'));
  assert.equal(ctx.kFixed, D.gen3sid.methodologies['emerald/gba/typed-tid-sid-v1'].model.variants.birch.text_speed.fast.name_lengths['1'].k_fixed, 'k_fixed is the data\'s own for fast / 1 letter');
  const win = G1.kWindowForCue(ctx.model, 1, 'fast', 30, S.CUE_EARLY_FRAMES, S.CUE_LATE_FRAMES);
  const cues = S.beepCues(G1, ctx);
  assert.equal(cues.length, win.beeps.length);
  cues.forEach((c, i) => { assert.ok(Math.abs(c.t - G1.gbaFramesToSeconds(win.beeps[i][1])) < 1e-12); assert.equal(c.label, win.beeps[i][0]); assert.equal(c.freq, i === cues.length - 1 ? G1.A_CUE_TONE[0] : G1.COUNT_IN_TONE[0]); });
  const seed = parseInt(D.gen3sid.methodologies['emerald/gba/typed-tid-sid-v1'].model.variants.birch.text_speed.fast.name_lengths['1'].seed, 16);
  const sidHex = D.gen3sid.methodologies['emerald/gba/typed-tid-sid-v1'].model.variants.birch.text_speed.fast.name_lengths['1'].sid;
  const c = S.candidates(G1, ctx, seed, false, [], null);
  assert.deepEqual(c.range, [ctx.kFixed, ctx.kFixed + ctx.model.k_default_span]);
  assert.equal(c.kept[0].sid, parseInt(sidHex, 16), 'the all-earliest k gives the data\'s measured SID for its seed');
  const err = S.context(D, G1, 'emerald', null, '', 1, 30);
  assert.match(err.error, /text speed/);
});

test('cue engine pure parts and the app bridge / prefs', () => {
  const Cue = H.page('page-cue.js'), A = H.app();
  const cues = [{ t: 1, freq: 880, ms: 60, label: 'count-2', kind: 'count' }, { t: 2, freq: 1320, ms: 150, label: 'A', kind: 'A' }, { t: 0.5, freq: 660, ms: 80, label: 'hold-start', kind: 'hold' }, { t: 3, freq: 1, ms: 1, label: 'x', kind: 'nope' }];
  const v = Cue.visualsFor(cues, 2.5);
  assert.deepEqual(v.map((x) => [x.text, x.cls, x.durS]), [['2', 'v-white', 0.3], ['A!', 'v-green', 2.5], ['HOLD START', 'v-blue', 0.5]]);
  const p = Cue.program({ cues });
  assert.ok(Math.abs(p.endT - (3 + 0.001 + 0.5)) < 1e-9 || p.endT >= 2.15, 'endT covers the last tone');
  assert.throws(() => Cue.program({}), /needs cues/);
  // the bridge: init merges prefs, a queued message is drained, a malformed one is reported not thrown
  A.outbox.length = 0;
  A.prefs = { version: 1, nav: { game: 'red', mode: 'gen1-buffer' } };
  let inited = 0; A.onInit = () => { inited++; };
  A.receive({ type: 'init', platformOS: 'ios', prefs: { buffer: { platform: 'dmg' } } });
  assert.equal(A.platformOS, 'ios'); assert.equal(A.pref('buffer', 'platform', 'gbp'), 'dmg'); assert.deepEqual(A.prefs.nav, { game: 'red', mode: 'gen1-buffer' }); assert.equal(inited, 1);
  A.receive('garbage');
  assert.equal(A.outbox[A.outbox.length - 1].type, 'error');
  globalThis.__tidHelperQueue = [{ type: 'init', platformOS: 'android', prefs: null }];
  A.installBridge();
  assert.equal(A.platformOS, 'android'); assert.equal(inited, 2); assert.deepEqual(globalThis.__tidHelperQueue, []);
  assert.equal(typeof globalThis.TidHelperBridge.receive, 'function');
  A.setPref('gen2', { platform: 'gbc' });
  const last = A.outbox[A.outbox.length - 1];
  assert.equal(last.type, 'prefs'); assert.equal(last.prefs.gen2.platform, 'gbc'); assert.equal(A.PREFS_KEY, 'hackmons_tidhelper_prefs_v1');
  A.setCal('gen1.gbp.menu', { samples: [{ implied_ms: 1 }], override: 5 });
  assert.deepEqual(A.cal('gen1.gbp.menu'), { samples: [{ implied_ms: 1 }], override: 5 });
  assert.deepEqual(A.cal('nope'), { samples: [], override: null });
  assert.equal(A.parseFps('4194304/70224'), 4194304 / 70224);
  assert.throws(() => A.parseFps('59.7'), /not a\/b/);
});
