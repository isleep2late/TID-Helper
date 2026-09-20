// rs.test.cjs - the Ruby / Sapphire engine against gen3-rs.json. Run: node --test tests/tid-helper/*.test.cjs
//   1. the data's lcrng block is the engine's LCRNG; pair() reproduces EVERY vector of every game (dead-battery and
//      live-battery seeds alike); NEGATIVE CONTROLS: a tid+1 twin, a sid+1 twin and the P+1 neighbour are all rejected;
//   2. the dead-battery checks (pairs_P_min_to_plus5) and the live-battery seed examples reproduce; rsSeed equals the
//      data's own `javascript` implementation on the examples and on 200 random clocks;
//   3. table() is one step per frame (equals pair() on every row), searchTid finds what pair() gives, the anchor and cue
//      arithmetic use the data's frames;
//   4. the P_min selector offers only values the data attests a press on. p_min_frames_notes is a notes map, not a list
//      of opening paths: it also carries the battery-dry box's frame COST, which the selector used to render as a P_min;
//   5. the target sets this page offers are filtered by each set's own `games` list. The whole of gen1-tid.json's block
//      used to be offered here, so a Gen 3 page listed Red/Blue and Yellow route targets.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines(), R = H.page('page-gen3-rs.js');

test('every gen3-rs vector reproduces; negative controls fail', () => {
  assert.ok(R.checkLcrng(D));
  let n = 0;
  for (const [game, g] of Object.entries(D.gen3rs.games)) {
    for (const v of g.vectors) {
      const r = R.pair(D, game, v.seed, v.press_frame);
      assert.equal(r.tid, v.tid, game + ' ' + v.run + ' P ' + v.press_frame + ' tid');
      assert.equal(r.sid, v.sid, game + ' ' + v.run + ' P ' + v.press_frame + ' sid');
      assert.equal(r.steps, v.lcrng_steps_to_sid, 'steps to the SID word');
      assert.ok(R.vectorOk(D, game, v));
      n++;
    }
    const v0 = g.vectors[0];
    assert.ok(!R.vectorOk(D, game, Object.assign({}, v0, { tid: (v0.tid + 1) & 0xFFFF })), 'NEGATIVE CONTROL: tid+1 rejected');
    assert.ok(!R.vectorOk(D, game, Object.assign({}, v0, { sid: (v0.sid + 1) & 0xFFFF })), 'NEGATIVE CONTROL: sid+1 rejected');
    assert.ok(!R.vectorOk(D, game, Object.assign({}, v0, { press_frame: v0.press_frame + 1 })), 'NEGATIVE CONTROL: P+1 rejected');
    assert.ok(!R.vectorOk(D, game, Object.assign({}, v0, { seed: (v0.seed + 1) & 0xFFFF })), 'NEGATIVE CONTROL: seed+1 rejected');
    for (const c of g.dead_battery_checks || []) for (const [P, tid, sid] of c.pairs_P_min_to_plus5) {
      const r = R.pair(D, game, g.dead_battery_seed, P);
      assert.equal(r.tid, tid, game + ' ' + c.run + ' P ' + P); assert.equal(r.sid, sid);
    }
  }
  assert.equal(n, Object.values(D.gen3rs.games).reduce((s, g) => s + g.vectors.length, 0));
  assert.ok(n >= 180, 'vectors: ' + n);
  const bad = JSON.parse(JSON.stringify(D)); bad.gen3rs.lcrng.add = '0x6074';
  assert.throws(() => R.checkLcrng(bad), /not the engine/);
});

test('the live-battery seed: the data\'s examples, clock_model_checks and its own javascript', () => {
  const lb = D.gen3rs.live_battery_seed;
  for (const ex of lb.examples) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(ex.clock);
    const r = R.rsSeed(+m[1], +m[2], +m[3], +m[4], +m[5]);
    assert.equal(r.seed, ex.seed, ex.clock); assert.equal(r.dayCount, ex.day_count); assert.equal(r.minuteCount, ex.minute_count);
  }
  for (const [game, g] of Object.entries(D.gen3rs.games)) for (const c of g.clock_model_checks || []) {
    const m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(c.clock);
    const r = R.rsSeed(+m[1], +m[2], +m[3], +m[4], +m[5]);
    assert.equal(r.dayCount, c.day_count, game + ' ' + c.run); assert.equal(r.seed, c.seed_expected); assert.equal(c.seed_expected, c.seed_observed);
  }
  const theirs = new Function(lb.javascript + '; return rsSeed;')();
  let seed = 12345; const rnd = (n) => { seed = (Math.imul(1103515245, seed) + 24691) >>> 0; return seed % n; };
  for (let i = 0; i < 200; i++) {
    const y = 2000 + rnd(60), mo = 1 + rnd(12), d = 1 + rnd(28), hh = rnd(24), mm = rnd(60);
    assert.equal(R.rsSeed(y, mo, d, hh, mm).seed, theirs(y, mo, d, hh, mm), [y, mo, d, hh, mm].join('-'));
  }
});

test('table, searchTid, the anchor and the cue arithmetic', () => {
  const g = D.gen3rs.games.ruby, S = g.dead_battery_seed, p0 = g.model.p_min_frames;
  const rows = R.table(D, 'ruby', S, p0, p0 + 500);
  assert.equal(rows.length, 501);
  for (const r of rows.filter((_, i) => i % 50 === 0)) assert.deepEqual([r.tid, r.sid], (({ tid, sid }) => [tid, sid])(R.pair(D, 'ruby', S, r.P)), 'row P ' + r.P);
  const want = rows[123];
  const hits = R.searchTid(D, 'ruby', S, want.tid, p0, p0 + 500, 0);
  assert.ok(hits.some((h) => h.P === want.P && h.sid === want.sid));
  assert.equal(R.anchorFrame(D, 'ruby'), g.model.anchor.first_game_frame_to_copyright_text_fully_visible);
  assert.ok(Math.abs(R.fps(D) - E.core.GBA_FPS) < 1e-12, 'the data\'s gba_fps_expression is the engine\'s GBA_FPS');
  assert.ok(Math.abs(R.pressSeconds(D, 'ruby', p0) - (p0 - R.anchorFrame(D, 'ruby')) / E.core.GBA_FPS) < 1e-12);
  const c = R.cueProgram(E.G1, D, 'ruby', p0 + 300, 100, 4, 1.0);
  assert.equal(c.cues.length, 5); assert.equal(c.cues[4].kind, 'A'); assert.equal(c.cues[4].freq, E.G1.A_CUE_TONE[0]);
  assert.ok(Math.abs(c.tA - (R.pressSeconds(D, 'ruby', p0 + 300) - 0.1)) < 1e-12, 'the A tone is the press second minus the correction');
  assert.deepEqual(c.cues.slice(0, 4).map((x) => +(c.tA - x.t).toFixed(9)), [4, 3, 2, 1], 'count-in 1 s apart');
  assert.throws(() => R.cueProgram(E.G1, D, 'ruby', R.anchorFrame(D, 'ruby') - 1, 0, 4, 1.0), /before the anchor/);
});

test('the P_min selector offers only frames the data records a press on', () => {
  for (const [game, g] of Object.entries(D.gen3rs.games)) {
    const notes = g.model.p_min_frames_notes, o = R.pMinOptions(D, game);
    const attested = R.attestedPressFrames(D, game);
    // every option is a press frame the data attests (a vectors[].press_frame or a dead_battery_checks[].p_min)
    assert.ok(o.options.length >= 4, game + ': ' + o.options.length + ' opening paths offered');
    for (const opt of o.options) {
      assert.equal(notes[opt.key], opt.frames, game + ': the option carries the note\'s own value');
      assert.ok(attested[opt.frames], game + ': P_min ' + opt.frames + ' ("' + opt.key + '") is attested as a press frame');
    }
    // the data's own p_min_frames must be offered: it is the page's default
    assert.ok(o.options.some((x) => x.frames === g.model.p_min_frames), game + ': model.p_min_frames is an option');
    // nothing is dropped silently: options + notPressFrames is the whole notes map
    assert.deepEqual(o.options.concat(o.notPressFrames).map((x) => x.key).sort(), Object.keys(notes).sort(), game + ': every note is accounted for');
    // REGRESSION: the block carries a frame COST as well as frame indices, and a cost is not a P_min. Offering the
    // whole map (Object.keys(p_min_frames_notes)) put 288 in the list, below every press the data has ever recorded.
    const floor = Math.min(...g.vectors.map((v) => v.press_frame));
    for (const opt of o.options) assert.ok(opt.frames >= floor, game + ': "' + opt.key + '" = ' + opt.frames + ' is below the earliest attested press frame ' + floor);
    assert.ok(o.notPressFrames.length > 0, game + ': the notes map does carry a non-press-frame entry');
    for (const x of o.notPressFrames) {
      assert.ok(!attested[x.frames], game + ': "' + x.key + '" = ' + x.frames + ' is attested nowhere as a press frame');
      assert.ok(x.frames < floor, game + ': "' + x.key + '" = ' + x.frames + ' is not a frame a press can be read on (earliest ' + floor + ')');
    }
  }
});

test('the target sets offered here are the sets whose own games list names this game', () => {
  for (const game of Object.keys(D.gen3rs.games)) {
    const offered = R.targetSetsFor(D, game);
    for (const s of offered) assert.ok((s.spec.games || []).indexOf(game) !== -1, game + ': offered set ' + s.key + ' names it');
    // REGRESSION: gen1-tid.json's block was handed over whole, so ruby and sapphire were offered Red/Blue and Yellow
    // route targets. No shipped set lists a Gen 3 game, so nothing may be offered here.
    const gen1Keys = Object.keys(D.gen1.target_sets);
    assert.ok(gen1Keys.length >= 4, 'gen1-tid.json does define sets, so an empty result is a filter and not an empty source');
    for (const k of gen1Keys) {
      const g = D.gen1.target_sets[k].games || [];
      if (g.indexOf(game) === -1) assert.ok(!offered.some((s) => s.key === k), game + ': ' + k + ' (games ' + JSON.stringify(g) + ') must not be offered');
    }
    assert.equal(offered.length, 0, game + ': no shipped target set names it, so the page offers none');
  }
  // POSITIVE CONTROL: the same filter over a game the sets do name returns them, so it is not rejecting everything
  const red = R.targetSetsFor(D, 'red');
  assert.ok(red.length > 0, 'the filter passes the sets that name red');
  for (const s of red) assert.ok(s.spec.games.indexOf('red') !== -1);
});
