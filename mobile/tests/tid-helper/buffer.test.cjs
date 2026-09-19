// buffer.test.cjs - the Gen 1 buffer guide's pure module over the compact gen1-buffer.json. Run: node --test tests/tid-helper/*.test.cjs
//   1. lookup reproduces every TID of fixtures/buffer-vectors.json (RNG Solution's 50 random TIDs per table, made by
//      make_json.py --vectors from the same JSON: sha1 recorded in the fixture) and 16589 -> Red GBP
//      pal(hold)_gfskip_hop0_title1_newgame;
//   2. step rendering never emits a token without a grammar entry: every token kind the encoding can produce AND every
//      token that occurs in any shipped table has a grammar entry (base, plus the modifier for the composite tokens), the
//      palette step comes first, and every line of a step is the grammar's own text;
//   3. the composed timeline for the fixture's 24 sampled harness rows (from the six windows-column CSVs of RNG Solution)
//      equals the CSV's recorded newgame and roll frames; its SECONDS chain the data's own reg_s / next_s / roll_delay_s
//      from the Game Freak entry, and the residual against the CSV's roll seconds (what the page shows beside the
//      storyboard) is measured: -82 to -195 ms over the 24 rows (the composed clock is late; max 195 ms on the Yellow
//      GBP row with 11 title visits), NOT within 30 ms, because gen1-buffer.json carries no seconds for power-on -> the
//      Game Freak entry (steps only: game_start_frame + gamefreak_start) nor for the title screens (per-entry reg / exit
//      steps only), and steps run ahead of real frames at every LCD on/off (windows.note); the sign and the envelope are
//      asserted, not a tighter number; a list-only row (no title windows) throws instead of guessing;
//   4. the verification tag is the encoding block's own wording; the set search returns >= 10 rows, sorted simplest first.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.cjs');

const D = H.data(), E = H.engines(), B = H.page('page-gen1-buffer.js');

test('lookup: the 50-vector fixture per table and 16589 -> Red GBP pal(hold)_gfskip_hop0_title1_newgame', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'buffer-vectors.json'), 'utf8'));
  assert.equal(fx.generated_from_sha1, H.sources().sha1s.buffer, 'the fixture was made from the gen1-buffer.json that ships here');
  let n = 0;
  for (const [key, vecs] of Object.entries(fx.vectors)) {
    const [game, plat] = key.split('/');
    for (const v of vecs) {
      const l = B.lookup(D, E.BD, game, plat, v.tid);
      assert.ok(l, key + ' ' + v.tid + ' found');
      assert.deepEqual(l.entries.map((e) => [e.seq, e.s, e.v, e.win]), v.entries.map((e) => [e.seq, e.s, e.v, e.w]), key + ' ' + v.tid);
      n++;
    }
  }
  // 50 vectors per table over four tables (red and yellow, gbp and dmg). Blue left the
  // buffer guide when the tables became community-sourced: no community list for Blue
  // exists, so every Blue row would have been ours alone.
  assert.ok(n >= 200, 'vectors replayed: ' + n);
  const l = B.lookup(D, E.BD, 'red', 'gbp', 16589);
  assert.equal(l.entries[0].seq, 'pal(hold)_gfskip_hop0_title1_newgame');
  assert.equal(l.entries[0].seconds, l.entries[0].s / 100);
  assert.equal(l.entries[0].verification, B.verificationText(D, l.entries[0].v));
  assert.equal(B.lookup(D, E.BD, 'yellow', 'gbp', 5), null, 'a TID absent from a table is null, not an entry');
  assert.throws(() => B.lookup(D, E.BD, 'red', 'gbc', 1), /no buffer table/);
});

test('steps: every encodable token and every shipped token has a grammar entry; palette step first; lines are the grammar\'s', () => {
  const g = D.buffer.grammar;
  for (const game of ['red', 'blue', 'yellow']) for (const tok of B.encodableTokens(D, game)) {
    const k = B.grammarKeys(D, tok, game);
    assert.ok(g[k.base], tok + ' -> base ' + k.base);
    if (k.modifier) assert.ok(g[k.modifier], tok + ' -> modifier ' + k.modifier);
  }
  // every token that actually occurs, from a full decode of every table
  const seen = new Set();
  for (const [game, plats] of Object.entries(D.buffer.games)) for (const plat of Object.keys(plats)) {
    const rows = E.BD.unpack(plats[plat].packed, game, D.buffer.windows.games[game][plat].scenes.title);
    for (const r of rows) for (const e of r.entries) for (const t of e.seq.split('_')) seen.add(game + ':' + t);
  }
  assert.ok(seen.size > 40, 'token kinds seen: ' + seen.size);
  for (const gt of seen) { const [game, tok] = gt.split(':'); const k = B.grammarKeys(D, tok, game); assert.ok(g[k.base] && (!k.modifier || g[k.modifier]), gt); }
  assert.throws(() => B.grammarKeys(D, 'bogus9', 'red'), /no grammar entry/);
  const st = B.steps(D, 'red', 'gbp', 'pal(hold)_gfskip_hop0_title1(scroll)_backout_title0_newgame');
  assert.equal(st[0].token, 'pal(hold)'); assert.equal(st[0].kind, 'boot'); assert.equal(st[0].means, g['pal(hold)'].means); assert.equal(st[0].window, g['pal(hold)'].window); assert.equal(st[0].citation, g['pal(hold)'].citation);
  assert.equal(st[3].grammarKey, 'titleN(scroll)'); assert.equal(st[3].means, g['titleN(scroll)'].means);
  assert.deepEqual(st.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7]);
  const dmg = B.steps(D, 'red', 'dmg', 'gfwait_hop6_title2_newgame');
  assert.equal(dmg[0].kind, 'boot-note'); assert.equal(dmg[0].means, D.buffer.windows.boot.dmg.note, 'DMG: the data\'s own boot note stands as the first step');
  const y = B.steps(D, 'yellow', 'gbp', 'gfskip_intro0(reset)_gfwait_introwait_title(usb)_csreset_gfskip_intro2_title_newgame');
  assert.equal(y[0].kind, 'boot-note', 'no palette token: the boot note comes first');
  assert.equal(y[2].grammarKey, 'introN'); assert.equal(y[2].modifier.key, 'hopN(reset)'); assert.equal(y[2].modifier.means, g['hopN(reset)'].means);
  assert.equal(y[5].grammarKey, 'title'); assert.equal(y[5].modifier.key, 'titleN(usb)');
  assert.equal(y[4].grammarKey, 'introN'); assert.equal(y[4].token, 'introwait');
});

test('composed timelines equal the recorded newgame / roll frames of 24 sampled harness rows; list-only rows throw', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'buffer-timeline-rows.json'), 'utf8'));
  assert.ok(fx.rows.length >= 20, 'rows: ' + fx.rows.length);
  const Story = H.page('page-storyboard.js');
  for (const r of fx.rows) {
    const wm = D.buffer.windows.games[r.game][r.platform];
    const win = r.windows ? r.windows.split(';').map((x) => x.split('/').map(Number)) : [];
    const tl = E.BD.composeTimeline(wm, D.buffer.platforms[r.platform].game_start_frame, r.sequence, win);
    assert.equal(tl.newgame, r.newgame_frame, r.game + '/' + r.platform + ' line ' + r.line + ' newgame');
    assert.equal(tl.roll, r.roll_frame, r.game + '/' + r.platform + ' line ' + r.line + ' roll');
    // the storyboard composes the same frames and anchors on the logo; its seconds are the data's per-action means
    const sb = Story.bufferTimeline(D, E.BD, r.game, r.platform, { seq: r.sequence, s: Math.round(r.seconds * 100), v: 'h', win });
    assert.equal(sb.newgameFrame, r.newgame_frame); assert.equal(sb.rollFrame, r.roll_frame);
    const fps = Story.fpsOf(D.gen1.fps_expression), logo = D.buffer.platforms[r.platform].nintendo_logo_frame;
    assert.ok(Math.abs(sb.roll.t - (sb.roll.seconds - logo / fps)) < 1e-9, 'roll t = composed seconds from the logo step');
    assert.ok(Math.abs(sb.roll.seconds - sb.roll.newgameSeconds - wm.roll_delay_s) < 1e-9, 'roll = the NEW GAME poll + roll_delay_s');
    const menuSeg = sb.segments.filter((s) => s.token === 'newgame').pop();
    assert.ok(Math.abs(sb.roll.newgameSeconds - (menuSeg.t0 + logo / fps) - wm.scenes.menu.newgame.reg_s) < 1e-9, 'the NEW GAME poll = menu entry + reg_s');
    assert.ok(Math.abs((menuSeg.t1 - menuSeg.t0) - (wm.scenes.menu.newgame.reg_s + wm.scenes.menu.newgame.next_s)) < 1e-9, 'the menu segment spans reg_s + next_s');
    sb.segments.forEach((s) => { if (s.secondsFrom === 'steps') assert.equal(s.id, 'title', 'only title segments are timed by steps'); });
    const gf = sb.segments.find((s) => s.token && s.id === 'gamefreak');
    assert.ok(Math.abs(gf.t0 - (D.buffer.platforms[r.platform].game_start_frame + wm.gamefreak_start - logo) / fps) < 1e-9, 'the Game Freak entry is steps / fps (no seconds in the data)');
    const ng = sb.inputs.filter((b) => b.text === 'newgame');
    assert.equal(ng.length, sb.steps.filter((s) => s.token === 'newgame').length, 'a press window per newgame token');
    assert.ok(sb.segments.length > 3 && sb.segments.every((s, i) => i === 0 || s.t0 >= sb.segments[i - 1].t0 - 1e-9), 'segments in time order');
  }
  // A list-only ("l") row has no measured windows, so the storyboard must refuse it. Since the
  // 2026-09-16 windows pass every community row is harness-measured and no "l" row is left in
  // the tables, so when the vectors carry none the case is exercised on a measured row with its
  // provenance downgraded and its windows removed - which is exactly what an "l" row is.
  const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'buffer-vectors.json'), 'utf8')).vectors;
  let listOnly = null, game = 'yellow', platform = 'gbp';
  for (const key of Object.keys(vectors)) {
    const lo = vectors[key].find((v) => v.entries.some((e) => e.v === 'l'));
    if (lo) { [game, platform] = key.split('/'); listOnly = E.BD.lookup(D.buffer, game, platform, lo.tid).entries.find((e) => e.v === 'l'); break; }
  }
  if (!listOnly) {
    const measured = E.BD.lookup(D.buffer, 'yellow', 'gbp', vectors['yellow/gbp'][0].tid).entries[0];
    listOnly = { ...measured, v: 'l', win: null };
  }
  assert.throws(() => Story.bufferTimeline(D, E.BD, game, platform, listOnly), /no measured title windows|list-only/);
});

test('composed roll seconds vs the entry\'s own s over the 24 harness rows: the residual the page shows, measured (not within 30 ms)', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'buffer-timeline-rows.json'), 'utf8'));
  const Story = H.page('page-storyboard.js'), residuals = [];
  for (const r of fx.rows) {
    const win = r.windows.split(';').map((x) => x.split('/').map(Number));
    const sb = Story.bufferTimeline(D, E.BD, r.game, r.platform, { seq: r.sequence, s: Math.round(r.seconds * 100), v: 'h', win });
    // the residual the page shows: the entry's own s minus the composed roll (negative = the composed clock is late)
    const residual = r.seconds - sb.roll.seconds;
    assert.ok(Math.abs(sb.rollResidualS - (Math.round(r.seconds * 100) / 100 - sb.roll.seconds)) < 1e-9, 'rollResidualS = s / 100 - composed roll');
    assert.ok(residual < 0, r.game + '/' + r.platform + ' line ' + r.line + ': the composed clock is late (steps run ahead of frames), residual ' + residual);
    assert.ok(Math.abs(residual) <= 0.25, r.game + '/' + r.platform + ' line ' + r.line + ': residual within the measured envelope (' + (residual * 1000).toFixed(1) + ' ms)');
    assert.match(sb.summary, /the composed clock is \d+ ms late by the roll/, 'the summary states the residual');
    residuals.push({ key: r.game + '/' + r.platform, line: r.line, ms: +(residual * 1000).toFixed(1), titles: sb.steps.filter((s) => s.scene === 'title').length });
  }
  // measured 2026-09-11 on these 24 rows: -82.2 ms (yellow/gbp line 13, 2 title visits) to -195.2 ms (yellow/gbp line 77, 11
  // title visits); Red / Blue rows (2 title visits each) -102.6 to -119.6 ms. The 30 ms target is NOT met: the data has no
  // seconds for power-on -> the Game Freak entry nor for the title screens (see the file header), and the residual grows
  // with the title visits, so what is asserted is the sign and the envelope, and that no row is within 30 ms.
  const worst = residuals.reduce((a, b) => (Math.abs(b.ms) > Math.abs(a.ms) ? b : a));
  assert.ok(Math.abs(worst.ms) > 30, 'measured: the data cannot place the roll within 30 ms (worst ' + worst.ms + ' ms, ' + worst.key + ' line ' + worst.line + ', ' + worst.titles + ' title visits)');
  assert.ok(residuals.every((x) => Math.abs(x.ms) >= 80), 'every row is at least 80 ms late (the power-on -> Game Freak stretch alone)');
  const y = residuals.filter((x) => x.key === 'yellow/gbp').sort((a, b) => a.titles - b.titles);
  for (let i = 1; i < y.length; i++) assert.ok(Math.abs(y[i].ms) > Math.abs(y[i - 1].ms), 'Yellow GBP: more title visits, more residual (' + y[i - 1].titles + ' -> ' + y[i].titles + ')');
});

test('verification wording is the data\'s; set search returns >= 10 rows, simplest first', () => {
  const entry = D.buffer.encoding.entry;
  for (const v of ['b', 'h', 'l']) assert.ok(entry.includes(v + ' (' + B.verificationText(D, v) + ')'), v);
  assert.throws(() => B.verificationText(D, 'z'), /does not describe/);
  const sets = B.setsFor(D, 'red');
  assert.ok(sets.some((s) => s.key === 'red-2swap' && s.tids.length === 256 && s.tids[0] === 16384 && s.kind === 'highbyte' && s.sameMembersAs === 'hi40-corruption'), 'the Any% 2-swap set: the $40 high byte, 256 TIDs, hi40-corruption\'s fields');
  // red-2swap is built from hi40-corruption, so it must offer the same games - but
  // compared WITHIN the buffer doc. gen1-tid.json still lists Blue there, because the
  // timed hold-START method still supports Blue; the buffer doc narrows every set to
  // the games that actually have a buffer table.
  assert.deepEqual(D.buffer.target_sets['red-2swap'].games, D.buffer.target_sets['hi40-corruption'].games, 'red-2swap offers the games hi40-corruption names');
  assert.ok(!D.buffer.target_sets['red-2swap'].games.includes('blue'), 'no buffer target set may name Blue');
  assert.ok(sets.some((s) => s.key === 'red-2swap' && s.tids.length === 256 && s.tids[255] === 0x40FF), 'the highbyte set expands to $4000-$40FF');
  assert.ok(!B.setsFor(D, 'yellow').some((s) => s.key === 'red-2swap'), 'red-2swap is not offered for Yellow');
  // identical membership is offered ONCE: the alias (same_members_as) stands in for the set it names, and says so
  for (const g of ['red']) {   // Blue is no longer a buffer game
    const offered = B.setsFor(D, g);
    assert.ok(!offered.some((s) => s.key === 'hi40-corruption'), g + ': hi40-corruption is folded into its alias');
    assert.ok(offered.some((s) => s.key === 'red-2swap' && /same members as hi40-corruption/.test(s.name)), g + ': the alias names the key it stands for');
    const seen = new Map();
    for (const s of offered) {
      const sig = s.tids.slice().sort((a, b) => a - b).join(',');
      assert.ok(!seen.has(sig), g + ': sets ' + seen.get(sig) + ' and ' + s.key + ' have identical membership');
      seen.set(sig, s.key);
    }
  }
  // NEGATIVE CONTROL: without same_members_as the pair would be offered twice and the membership check would fire
  const dup = JSON.parse(JSON.stringify(D)); delete dup.buffer.target_sets['red-2swap'].same_members_as;
  const twice = B.setsFor(dup, 'red').filter((s) => s.tids.length === 256).map((s) => s.key).sort();
  assert.deepEqual(twice, ['hi40-corruption', 'red-2swap'], 'PLANT FIRES: with the alias field removed both sets are offered');
  for (const [k, ts] of Object.entries(D.buffer.target_sets)) assert.ok(Array.isArray(ts.games) && ts.games.length, k + ' has a games list (no per-key fallback in the page)');
  assert.throws(() => B.setsFor({ buffer: { target_sets: { x: { name: 'x', kind: 'highbyte', hi: '40' } } } }, 'red'), /has no games list/);
  const r = B.setSearch(D, E.BD, 'red', 'gbp', 'red-2swap', 12);
  assert.ok(r.rows.length >= 10 && r.rows.length <= 12, 'rows: ' + r.rows.length);
  assert.equal(r.covered, 256, 'every $40xx has a sequence on Red GBP (complete table)');
  for (let i = 1; i < r.rows.length; i++) {
    const a = r.rows[i - 1].entry, b = r.rows[i].entry;
    const ka = [a.resetFree ? 0 : 1, a.tokens.length, a.s], kb = [b.resetFree ? 0 : 1, b.tokens.length, b.s];
    assert.ok(ka[0] < kb[0] || (ka[0] === kb[0] && (ka[1] < kb[1] || (ka[1] === kb[1] && ka[2] <= kb[2]))), 'sorted at ' + i);
  }
  for (const row of r.rows) assert.equal(row.entry.seq, E.BD.lookup(D.buffer, 'red', 'gbp', row.tid).entries[0].seq, 'the row is the table\'s own best entry');
  const cues = B.cueProgram(E.G1, H.page('page-storyboard.js').bufferTimeline(D, E.BD, 'red', 'gbp', B.lookup(D, E.BD, 'red', 'gbp', 16589).entries[0]), 0);
  assert.deepEqual(cues.map((c) => c.label), ['gfskip', 'hop0', 'title1', 'A', 'rolled']);
  assert.equal(cues[3].freq, E.G1.A_CUE_TONE[0]);
});
