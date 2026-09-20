// gen3-sid.test.cjs - the three defects fixed in page-gen3-sid.js (Emerald / FireRed / LeafGreen, the Secret ID
// from a typed Trainer ID), each pinned by a test that fails against the behaviour that was there before.
//   1. the cue's presses are not all A: every beep names its own button, out of the data's own words, and the
//      cue the engine is handed carries it (the old code labelled every beep with the raw stage name and the
//      page told the runner "press A ON each beep" - on the NEW NAME path beep 6 is START)
//   2. a played cue is honoured only for the game AND the settings it was played for (the old flag was a bare
//      module-level boolean that no game switch cleared)
//   3. the feedback this mode can actually give: a Secret ID learned after the fact gives k, and k gives the
//      last press's error against its beep
// Run: node --test tests/tid-helper/gen3-sid.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data();
const G1 = H.engines().G1;
const S = H.page('page-gen3-sid.js');
const GAMES = ['emerald', 'firered', 'leafgreen'];

// every (game, variant, text speed, name length, margin) the UI can produce
function* combos(margins = [S.MIN_MARGIN_FRAMES, S.DEFAULT_MARGIN_FRAMES, 60]) {
  for (const game of GAMES) {
    const meth = D.gen3sid.methodologies[D.gen3sid.games[game].methodology];
    for (const variant of G1.variantNames(meth.model)) {
      const model = G1.sidModel(D.gen3sid, D.gen3sid.games[game].methodology, variant);
      for (const speed of Object.keys(model.text_speed)) {
        for (let n = 1; n <= 7; n++) {
          for (const margin of margins) {
            const ctx = S.context(D, G1, game, variant, speed, n, margin);
            if (!ctx.error) yield { game, variant, speed, n, margin, ctx };
          }
        }
      }
    }
  }
}

// The one assertion that is expressible against the OLD module too (beepCues has always been exported), so it
// fails on a value rather than on a missing export: the page said "press A ON each beep" while the sixth beep of
// the NEW NAME path flashed the raw stage name 'rival-start' and the game wanted START.
test('FINDING 1: beep 6 of the FireRed NEW NAME path flashes START, not the stage name and not A', () => {
  const V = H.page('page-cue.js').VISUAL;
  const ctx = S.context(D, G1, 'firered', 'rival-newname', 'mid', 1, 30);
  const cue = S.beepCues(G1, ctx)[5];
  assert.equal(ctx.model.stage_text['rival-start'], 'START (cursor to OK)', 'the data is what says so');
  assert.equal(V[cue.kind].text(cue), 'START', 'what page-cue.js paints when this beep sounds');
  assert.notEqual(V[cue.kind].text(cue), 'rival-start');
});

test('FINDING 1: every beep names its own button, and on the NEW NAME path one of them is START, not A', () => {
  // the whole point: "press A ON each beep" is false, and it is false on a path the PSR route actually uses
  const seen = new Map();          // stage -> button, over every combination the UI can reach
  let combinations = 0, startBeeps = 0;
  for (const c of combos()) {
    combinations++;
    const rows = S.presses(G1, c.ctx);
    assert.equal(rows.length, c.ctx.win.beeps.length, 'one row per beep');
    for (const r of rows) {
      assert.ok(r.button, c.game + '/' + c.variant + ' beep ' + (r.i + 1) + ' (' + r.stage + ') has no button at all');
      const prev = seen.get(r.stage);
      if (prev !== undefined) assert.equal(r.button, prev, r.stage + ' must resolve to one button everywhere');
      seen.set(r.stage, r.button);
      // the frame and the time are the engine's, never this page's arithmetic
      assert.equal(r.t, G1.gbaFramesToSeconds(r.frame));
    }
    if (c.variant === 'rival-newname') {
      const odd = S.oddPresses(rows, S.defaultButton(c.ctx.meth));
      assert.equal(odd.length, 1, 'the NEW NAME path has exactly one press that is not the default button');
      assert.equal(odd[0].button, 'START');
      assert.equal(odd[0].i, 5, 'it is beep 6 of ' + rows.length);
      startBeeps++;
    }
  }
  assert.equal(combinations, 315, 'checked every combination the UI can produce');
  assert.equal(startBeeps, 126, 'the START beep is reachable from 126 of them');
  // the buttons, every one of them read out of the data rather than assumed
  assert.equal(seen.get('rival-start'), 'START');
  assert.equal(seen.get('rival-newname'), 'A');
  assert.equal(seen.get('rival-type'), 'A');
  assert.equal(seen.get('rival-ok'), 'A');
  for (const s of ['YES', 'YES-player', 'YES-rival', 'text-1', 'text-5', 'text-8', 'rival-preset']) assert.equal(seen.get(s), 'A', s);
});

test('FINDING 1: the button comes out of the data, and nothing is invented when the data is silent', () => {
  // the stage's own text decides first: the START stage says so in its stage_text
  const fr = G1.sidModel(D.gen3sid, 'firered/gba/typed-tid-sid-v1', 'rival-newname');
  assert.equal(S.pressButton(fr.stage_text['rival-start']), 'START');
  assert.equal(S.pressButton(fr.stage_text['text-1']), null, 'a paragraph-end stage names no button of its own');
  // ...and the fallback is the methodology's own validity condition, quoted, not a constant in the page
  for (const game of GAMES) {
    const meth = D.gen3sid.methodologies[D.gen3sid.games[game].methodology];
    const rule = S.pressRule(meth);
    assert.ok(rule && /one tap of A/.test(rule), game + ' carries the condition the default is read from');
    assert.ok(meth.validity.includes(rule), 'it is quoted verbatim from validity, not rewritten');
    assert.equal(S.defaultButton(meth), 'A');
  }
  // a methodology with no such condition gets no default at all rather than a guessed A
  assert.equal(S.defaultButton({ validity: ['nothing about presses here'] }), null);
  assert.equal(S.pressRule({ validity: [] }), null);
  const blind = S.presses(G1, Object.assign({}, S.context(D, G1, 'emerald', null, 'mid', 1, 30), { meth: { validity: [] } }));
  assert.deepEqual(blind.map((r) => r.button), new Array(blind.length).fill(null), 'no condition, no button claimed');
  // the second, uncued press the preset path needs is surfaced from the data's own text
  const pre = S.presses(G1, S.context(D, G1, 'firered', 'rival-preset', 'mid', 1, 30));
  const extra = S.extraPresses(pre);
  assert.equal(extra.length, 1);
  assert.equal(extra[0].stage, 'rival-preset');
  assert.deepEqual(extra[0].extra, ['DOWN']);
  assert.equal(S.extraPresses(S.presses(G1, S.context(D, G1, 'emerald', null, 'mid', 1, 30))).length, 0, 'Emerald needs no second press');
});

test('FINDING 1: the cue handed to the engine carries the button, so the flash cannot say A on the START beep', () => {
  const V = H.page('page-cue.js').VISUAL;
  for (const c of combos([S.DEFAULT_MARGIN_FRAMES])) {
    const rows = S.presses(G1, c.ctx), cues = S.beepCues(G1, c.ctx);
    assert.equal(cues.length, rows.length);
    cues.forEach((cue, i) => {
      const r = rows[i];
      assert.equal(cue.button, r.button);
      assert.equal(cue.stage, r.stage);
      // what page-cue.js will actually paint on the screen for this cue
      const painted = V[cue.kind].text(cue);
      assert.equal(painted.replace('!', ''), r.button, c.game + '/' + c.variant + ' beep ' + (i + 1) + ' paints ' + painted + ' for a ' + r.button + ' press');
      // the tones are still the engine's, unchanged: count-in for all but the last, the long A tone for the last
      assert.equal(cue.freq, i === cues.length - 1 ? G1.A_CUE_TONE[0] : G1.COUNT_IN_TONE[0]);
      assert.equal(cue.t, G1.gbaFramesToSeconds(c.ctx.win.beeps[i][1]));
    });
  }
  // the long green "A!" is page-cue's own hardcoded text, so it is only used while the last press really is A
  const fake = S.context(D, G1, 'firered', 'rival-newname', 'mid', 1, 30);
  fake.model = Object.assign({}, fake.model, { stage_text: Object.assign({}, fake.model.stage_text, { 'text-5': 'START (a data change: the last press is no longer A)' }) });
  const last = S.beepCues(G1, fake).slice(-1)[0];
  assert.equal(last.button, 'START');
  assert.equal(last.kind, 'press', 'not press-last, whose visual text is a hardcoded A!');
  assert.equal(V[last.kind].text(last), 'START');
  assert.equal(last.freq, G1.A_CUE_TONE[0], 'it still gets the long tone: that marks the press that sets k');
});

test('FINDING 2: a cue narrows the candidates only for the game and settings it was played for', () => {
  const em = S.context(D, G1, 'emerald', null, 'mid', 7, 30);
  const fr = S.context(D, G1, 'firered', null, 'mid', 7, 30);
  const cue = { sig: S.cueSignature('firered', fr) };            // the cue the runner played, on FireRed
  assert.equal(S.cueApplies(cue, 'firered', fr), true);
  assert.equal(S.cueApplies(cue, 'emerald', em), false, 'the same settings on another game are not what was cued');
  assert.equal(S.cueApplies(cue, 'leafgreen', S.context(D, G1, 'leafgreen', null, 'mid', 7, 30)), false);
  assert.equal(S.cueApplies(null, 'firered', fr), false);
  // and each of the four controls that used to clear the old boolean is covered by the same one check
  const moved = [S.context(D, G1, 'firered', null, 'fast', 7, 30), S.context(D, G1, 'firered', null, 'mid', 1, 30),
    S.context(D, G1, 'firered', 'rival-preset', 'mid', 7, 30), S.context(D, G1, 'firered', null, 'mid', 7, 45)];
  for (const m of moved) assert.equal(S.cueApplies(cue, 'firered', m), false, 'signature ' + S.cueSignature('firered', m));
  // no two reachable settings share a signature, so "still the same window" cannot be true by accident
  const sigs = new Map();
  for (const c of combos()) {
    const sig = S.cueSignature(c.game, c.ctx);
    const key = [c.game, c.variant, c.speed, c.n, c.margin].join('/');
    assert.ok(!sigs.has(sig) || sigs.get(sig) === key, 'signature collision: ' + key + ' vs ' + sigs.get(sig));
    sigs.set(sig, key);
  }
  // the consequence the runner saw: the narrowed list is a different list, so honouring it on the wrong game is a
  // real error and not a cosmetic one
  const tid = 12345;
  const wide = S.candidates(G1, em, tid, false, [], null);
  const narrow = S.candidates(G1, em, tid, true, [], null);
  assert.deepEqual(narrow.range, [em.win.kMin, em.win.kMax]);
  assert.equal(narrow.total, S.CUE_EARLY_FRAMES + S.CUE_LATE_FRAMES + 1);
  assert.ok(wide.total > narrow.total * 10, 'the cue window really is a small slice of the default span');
  assert.ok(!narrow.kept.some((c) => c.k === wide.kept[0].k), 'a wrongly applied window excludes the k a runner without a cue would be looking at');
});

test('FINDING 3: a Secret ID learned afterwards gives k, and k gives the last press\'s error against its beep', () => {
  // the data's own measured rows are runs with a known seed (the Trainer ID) and a known SID at the all-earliest
  // k_fixed: inverting one must land back on k_fixed exactly
  const meth = D.gen3sid.methodologies['firered/gba/typed-tid-sid-v1'];
  const row = meth.model.variants['rival-newname'].text_speed.mid.name_lengths['1'];
  const tid = parseInt(row.seed, 16), sid = parseInt(row.sid, 16);
  const ctx = S.context(D, G1, 'firered', 'rival-newname', 'mid', 1, 30);
  assert.equal(ctx.kFixed, row.k_fixed, 'the measured k_fixed is the page\'s');
  const o = S.observedK(G1, ctx, tid, sid);
  assert.ok(o.hits.length >= 1);
  const atFixed = o.hits.find((h) => h.k === row.k_fixed);
  assert.ok(atFixed, 'the data\'s own all-earliest run inverts to its own k_fixed');
  assert.equal(atFixed.fromFixed, 0);
  assert.equal(atFixed.fromExpected, row.k_fixed - ctx.win.kExpected, 'and it is a full cue margin per press early');
  assert.equal(atFixed.inWindow, false, 'pressing at the earliest possible frame is nowhere near the cue window');

  // a synthetic run that lands exactly on the cue, and ones a few frames either side of it
  for (const e of [-S.CUE_EARLY_FRAMES, -1, 0, 3, S.CUE_LATE_FRAMES, S.CUE_LATE_FRAMES + 5]) {
    const k = ctx.win.kExpected + e;
    const hitSid = G1.sidCandidates(tid, k, k)[0].sid;
    const res = S.observedK(G1, ctx, tid, hitSid);
    const h = res.hits.find((x) => x.k === k);
    assert.ok(h, 'k = ' + k + ' is found for the SID it produces');
    assert.equal(h.fromExpected, e, 'the last press was ' + e + ' frames from its beep');
    assert.equal(h.inWindow, e >= -S.CUE_EARLY_FRAMES && e <= S.CUE_LATE_FRAMES);
  }
  // a Secret ID that no reachable k produces is reported as such, never rounded to the nearest one
  let impossible = null;
  for (let s = 0; s <= 0xFFFF && impossible === null; s++) if (!S.observedK(G1, ctx, tid, s).hits.length) impossible = s;
  assert.ok(impossible !== null && S.observedK(G1, ctx, tid, impossible).hits.length === 0);

  // the samples summary, and the verdict that tells the runner whether the narrowing is holding
  assert.deepEqual(S.sampleStats([]), { n: 0 });
  const st = S.sampleStats([{ e: 2 }, { e: 8 }, { e: -1 }, { e: null }, { d: 400 }]);
  assert.deepEqual(st, { n: 3, mean: 3, min: -1, max: 8 });
  assert.equal(S.windowVerdict(st.mean), 'inside');
  assert.equal(S.windowVerdict(S.CUE_LATE_FRAMES + 0.5), 'late');
  assert.equal(S.windowVerdict(-S.CUE_EARLY_FRAMES - 0.5), 'early');
  assert.equal(S.windowVerdict(null), null);
  // frames become seconds through the engine's GBA rate, never a 60 Hz conversion of this page's own
  assert.equal(G1.gbaFramesToSeconds(ctx.win.kExpected), ctx.win.kExpected / G1.GBA_FPS);
  assert.ok(Math.abs(G1.GBA_FPS - 59.7275) < 0.001, 'the engine\'s GBA rate, not 60');
});
