// gen1-buffer-cue.test.cjs - the Gen 1 buffer guide's cue says what the grammar says.
//
// THE DEFECTS THIS PINS.
//  1. A press tone on a do-nothing step. hop0 straight after gfskip is the Up+Select+B of the Game Freak skip
//     simply still being held - the hopN grammar says so, three hundred characters in - and introwait is defined
//     as "let the whole intro play". Both were cued as presses, and an extra press on either moves the Trainer ID.
//     The step list knew about the first and not the second; the cue knew about neither, because it read the
//     timeline's bands rather than the grammar. tokenAct is now the single decision both of them use.
//  2. The opening edge. Every press tone sounded at the instant its window OPENED, which spends the whole window
//     on the runner's reaction - and the correction that might have covered that reaction defaulted to zero. The
//     narrowest windows in these routes are 50 ms. Tones now sound in the middle of the window, which is the point
//     with the most room either side: every frame from the opening to the poll that reads it gives the same ID.
//  3. pal(ab) had no cue at all, and its band on screen was the two-and-a-half second direction hold rather than
//     the fifteen-frame (251 ms) window the data gives for the A or B press inside it.
// Run: node --test tests/tid-helper/gen1-buffer-cue.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines();
const B = H.page('page-gen1-buffer.js'), S = H.page('page-storyboard.js');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' ' + a + ' vs ' + b);

// the first table entry matching a predicate over its tokens, so the test names a real shipped route
function findSeq(game, platform, pred) {
  const t = B.table(D, E.BD, game, platform);
  for (const tid of Object.keys(t)) for (const e of t[tid]) if (pred(e.seq.split('_'), e)) return { tid: Number(tid), e };
  return null;
}

test('every token the cue refuses to call a press is one the grammar defines as making no new input', () => {
  const g = D.buffer.grammar;
  // the list in the page is code because the grammar states this in prose; this ties each member back to the
  // sentence that says it, so the list cannot drift from the data without a test failing
  for (const tok of Object.keys(B.KEEP_TOKENS)) {
    const key = B.grammarKeys(D, tok, 'red').base, text = (g[key].means + ' ' + (g[key].window || '')).toLowerCase();
    const saysSo = /do nothing|do not touch|touch nothing|let the whole intro play|let it play out|no a\/start press|must see no input/.test(text);
    assert.ok(saysSo, tok + ' (grammar ' + key + ') is treated as a do-nothing step, but its grammar does not say so: ' + text.slice(0, 200));
  }
  // and the converse for the ordinary press tokens of both families
  for (const tok of ['hop1', 'hop3', 'intro1', 'newgame', 'backout', 'gfskip']) {
    assert.ok(!B.KEEP_TOKENS[tok], tok + ' is a press and must not be in the do-nothing list');
  }
});

test('tokenAct: hop0 is a continuation only where the grammar says, and introwait always is', () => {
  assert.equal(B.tokenAct(['gfskip', 'hop0', 'title0'], 1), 'keep', 'hop0 after gfskip is the skip still being held');
  assert.equal(B.tokenAct(['gfwait', 'hop0', 'title0'], 1), 'press', 'hop0 after anything else is a real press');
  assert.equal(B.tokenAct(['hop0'], 0), 'press');
  assert.equal(B.tokenAct(['gfskip', 'intro0'], 1), 'press', 'Yellow\'s introN family has no continuation rule: the grammar gives it none');
  assert.equal(B.tokenAct(['gfskip', 'introwait'], 1), 'keep');
  assert.equal(B.tokenAct(['gfskip', 'hop6'], 1), 'keep');
  assert.equal(B.tokenAct(['gfwait', 'hop1'], 0), 'keep', 'gfwait is the do-nothing member of its own family');
});

test('the step list and the cue agree, token for token, on every shipped Red route sampled', () => {
  const t = B.table(D, E.BD, 'red', 'gbp');
  let checked = 0, keeps = 0;
  for (const tid of Object.keys(t).slice(0, 400)) {
    const e = t[tid][0], toks = e.seq.split('_');
    const st = B.steps(D, 'red', 'gbp', e.seq);
    for (const s of st) {
      if (s.kind === 'boot-note' || s.kind === 'boot') continue;
      const i = toks.indexOf(s.token) === -1 ? null : st.filter((x) => x.kind !== 'boot-note').indexOf(s);
      if (i == null) continue;
      assert.equal(s.act, B.tokenAct(toks, i), e.seq + ' step ' + s.token + ': the list and the cue must make the same call');
      if (s.act === 'keep') { assert.equal(s.kind, 'hold', 'a do-nothing step is never shown as a press'); keeps++; }
    }
    checked++;
  }
  assert.ok(checked > 300 && keeps > 0, 'sampled ' + checked + ' routes, ' + keeps + ' do-nothing steps among them');
});

test('a do-nothing step gets the hold tone and never a press tone; presses sit in the middle of their window', () => {
  const hit = findSeq('red', 'gbp', (t) => t.indexOf('gfskip') >= 0 && t[t.indexOf('gfskip') + 1] === 'hop0');
  assert.ok(hit, 'a gfskip_hop0 route ships for Red GBP');
  const tl = S.bufferTimeline(D, E.BD, 'red', 'gbp', hit.e);
  const cues = B.cueProgram(E.G1, tl, 0);
  const toks = tl.steps.map((s) => s.token);
  const bandOf = (step) => tl.inputs.find((b) => b.kind === 'window' && b.step === step);

  const keep = cues.filter((c) => c.kind === 'keep');
  assert.ok(keep.length >= 1, 'the continuation is cued as a continuation');
  for (const c of keep) {
    assert.equal(c.freq, E.G1.HOLD_TONE[0], 'a do-nothing step gets the low hold tone');
    assert.notEqual(c.freq, E.G1.MENU_MARK_TONE[0]);
    assert.notEqual(c.freq, E.G1.A_CUE_TONE[0]);
    assert.ok(/keep|nothing/.test(c.label), 'and its words say to change nothing: ' + c.label);
  }
  // matched positionally, not by token: a route repeats title0 and opt(backout) many times over, and matching
  // by name would compare the third title0's cue against the first title0's band
  const pressBands = tl.inputs.filter((b) => b.kind === 'window' && B.tokenAct(toks, b.step) === 'press');
  const pressCues = cues.filter((c) => (c.kind === 'mark' || c.kind === 'A') && c.label !== 'rolled');
  assert.ok(!tl.inputs.some((b) => b.kind === 'boot' && (b.act === 'press' || b.act === 'release')), 'this route opens with nopal, so no boot tone is in the list');
  assert.equal(pressCues.length, pressBands.length, 'one tone per press window, and no tone for the do-nothing steps');
  pressBands.forEach((b, i) => {
    near(pressCues[i].t, (b.t0 + b.regT) / 2, pressCues[i].label + ' #' + i + ': the tone is in the middle of its window');
    assert.ok(pressCues[i].t > b.t0 + 1e-9, pressCues[i].label + ' #' + i + ': and strictly after the window opens, which is where it used to sound');
    assert.ok(pressCues[i].t < b.regT, pressCues[i].label + ' #' + i + ': and before the poll that reads it');
  });
  assert.ok(pressBands.length >= 3, 'checked ' + pressBands.length + ' press cues');
  // the tightest window in the shipped Red routes is the one the old edge-aimed cue was hopeless on
  const widths = cues.filter((c) => c.windowS != null).map((c) => c.windowS * 1000);
  assert.ok(Math.min.apply(null, widths) < 400, 'these routes really do contain sub-400 ms windows (' + Math.round(Math.min.apply(null, widths)) + ' ms)');
});

test('pal(ab): the band is the A/B press window from the data, and it is cued', () => {
  const bw = D.buffer.windows.boot.gbp['pal(ab)'];
  const bands = S.bootBands('pal(ab)', bw);
  assert.equal(bands.length, 2, 'a direction held from power-on AND an A or B press inside it');
  const press = bands.find((b) => b.act === 'press');
  assert.equal(press.from, bw.a_or_b_press_between[0], 'the press band is the data\'s own window, not the direction span');
  assert.equal(press.to, bw.a_or_b_press_between[1] + 1);
  assert.ok(bands.find((b) => b.act === 'hold').to - 1 === bw.direction_through, 'the direction band is the direction band');

  const hit = findSeq('red', 'gbp', (t) => t[0] === 'pal(ab)');
  assert.ok(hit, 'a pal(ab) route ships for Red GBP');
  const tl = S.bufferTimeline(D, E.BD, 'red', 'gbp', hit.e);
  const cued = B.cueProgram(E.G1, tl, 0).filter((c) => /pal\(ab\)/.test(c.label));
  assert.equal(cued.length, 1, 'exactly one tone for it: the press, not the hold');
  assert.ok(cued[0].windowS * 1000 < 300, 'and the window it names is the 251 ms one: ' + Math.round(cued[0].windowS * 1000) + ' ms');
  assert.ok(cued[0].t > 0, 'it falls after the Nintendo logo anchor, so it can actually be played');
  // every palette token's bands come from the data, and nopal - which asks for no input - is never a press
  for (const tok of Object.keys(D.buffer.windows.boot.gbp)) {
    if (tok === 'note') continue;
    for (const b of S.bootBands(tok, D.buffer.windows.boot.gbp[tok])) {
      assert.ok(['nothing', 'hold', 'press', 'release'].includes(b.act), tok + ' band act');
      if (tok === 'nopal') assert.equal(b.act, 'nothing');
    }
  }
});

test('the count-in runs into the first step, and nothing is scheduled before the anchor', () => {
  const hit = findSeq('red', 'gbp', (t) => t[0] === 'nopal' && t.indexOf('gfskip') >= 0);
  const tl = S.bufferTimeline(D, E.BD, 'red', 'gbp', hit.e);
  const cues = B.cueProgram(E.G1, tl, 0, 3, 1.0);
  const count = cues.filter((c) => c.kind === 'count');
  assert.equal(count.length, 3 - cues.droppedCountIn, 'the beeps that survive are the ones that fit');
  assert.equal(cues.droppedCountIn, 0, 'this route starts late enough for all three');
  const first = cues.find((c) => c.kind !== 'count');
  for (let i = 0; i < count.length; i++) near(count[i].t, first.t - (count.length - i) * 1.0, 'beep ' + i);
  for (const c of cues) assert.ok(c.t >= 0, c.label + ' is not scheduled before the anchor');
  assert.equal(cues.droppedCues, 0, 'and no step of this route falls before the logo');
  // a route whose first step is the pal(ab) press has no room for a run-up, and says so rather than pretending
  const pal = findSeq('red', 'gbp', (t) => t[0] === 'pal(ab)');
  const palCues = B.cueProgram(E.G1, S.bufferTimeline(D, E.BD, 'red', 'gbp', pal.e), 0, 3, 1.0);
  assert.equal(palCues.filter((c) => c.kind === 'count').length, 3 - palCues.droppedCountIn);
  assert.ok(palCues.droppedCountIn > 0, 'the pal(ab) press comes ' + palCues[0].t.toFixed(2) + ' s after the logo, too soon for three beeps');
});

test('the roll marker is not dressed as a press, and every cue kind has a visual', () => {
  const Cue = H.page('page-cue.js');
  const hit = findSeq('red', 'gbp', (t) => t.indexOf('gfskip') >= 0);
  const tl = S.bufferTimeline(D, E.BD, 'red', 'gbp', hit.e);
  const cues = B.cueProgram(E.G1, tl, 120, 3, 1.0);
  const roll = cues.filter((c) => c.label === 'rolled');
  assert.equal(roll.length, 1);
  assert.equal(roll[0].kind, 'rolled', 'it is its own kind, not a press mark');
  assert.notEqual(roll[0].freq, E.G1.MENU_MARK_TONE[0], 'and not the press tone');
  assert.notEqual(roll[0].freq, E.G1.A_CUE_TONE[0]);
  // the correction moves presses; there is no press here, so it must not move
  near(roll[0].t, tl.roll.t, 'the roll marker ignores the correction');
  // every kind this program emits is one the cue engine can draw
  const visuals = Cue.visualsFor(cues);
  assert.equal(visuals.length, cues.length, 'no cue kind falls through the visual map: ' +
    cues.filter((c) => !visuals.some((v) => v.t === c.t)).map((c) => c.kind).join(', '));
  assert.ok(visuals.some((v) => v.kind === 'rolled' && /rolled/i.test(v.text)));
  assert.notEqual(visuals.find((v) => v.kind === 'rolled').cls, visuals.find((v) => v.kind === 'mark').cls,
    'and it does not flash the press colour');
});

test('nopal is a do-nothing step, and the count-in leads into the first real press', () => {
  assert.equal(B.tokenAct(['nopal', 'gfskip'], 0), 'keep', 'the grammar: "Touch nothing while the Nintendo logo is on screen"');
  assert.ok(B.KEEP_TOKENS.nopal, 'and it is in the list the step count uses');
  // a route that OPENS with a do-nothing step: the run-up must lead to the press, not to the doing of nothing
  const hit = findSeq('red', 'gbp', (t) => t[0] === 'pal(hold)' && t[1] === 'gfwait');
  if (!hit) { assert.ok(true, 'no such route ships'); return; }
  const cues = B.cueProgram(E.G1, S.bufferTimeline(D, E.BD, 'red', 'gbp', hit.e), 0, 3, 1.0);
  const counts = cues.filter((c) => c.kind === 'count');
  const firstPress = cues.filter((c) => c.kind === 'mark' || c.kind === 'A')[0];
  const firstKeep = cues.filter((c) => c.kind === 'keep')[0];
  assert.ok(firstKeep && firstKeep.t < firstPress.t, 'this route really does open with a do-nothing step');
  assert.equal(counts.length, 3);
  near(counts[counts.length - 1].t, firstPress.t - 1.0, 'the last beep is one spacing before the first press');
  assert.ok(counts[0].t > firstKeep.t, 'the run-up starts after the do-nothing step, not before it');
  // and the list the clock readout walks is in time order, count-in included
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].t >= cues[i - 1].t, 'cue ' + i + ' is out of order');
});

test('Yellow: introwait is not cued as a press', () => {
  const hit = findSeq('yellow', 'gbp', (t) => t.includes('introwait')) || findSeq('yellow', 'dmg', (t) => t.includes('introwait'));
  if (!hit) { assert.ok(true, 'no shipped Yellow route uses introwait; tokenAct is covered by the unit test above'); return; }
  const plat = B.table(D, E.BD, 'yellow', 'gbp')[hit.tid] ? 'gbp' : 'dmg';
  const st = B.steps(D, 'yellow', plat, hit.e.seq).filter((s) => s.token === 'introwait');
  for (const s of st) { assert.equal(s.act, 'keep'); assert.equal(s.kind, 'hold', 'introwait is "let the whole intro play", not a press'); }
  const cues = B.cueProgram(E.G1, S.bufferTimeline(D, E.BD, 'yellow', plat, hit.e), 0);
  for (const c of cues) if (c.token === 'introwait') { assert.equal(c.kind, 'keep'); assert.equal(c.freq, E.G1.HOLD_TONE[0]); }
});
