#!/usr/bin/env node
// gen-tid-helper-data.cjs - embeds the eight shared Trainer ID data files (the single sources of truth under
// <repo>/src/lib/shiny/data) into TypeScript modules for the "Get a TID" page. Nothing is retyped: every file is
// validated (loudly), then embedded with the sha1 of its source bytes beside it.
//
//   node scripts/gen-tid-helper-data.cjs [--data-dir <dir>] [--out-dir <dir>] [--check]
//
// TWO files are written:
//   src/offline/tidHelperDataJson.ts   one string export (tidHelperDataJson) holding
//                                      {"gen1","gen2","gen2psr","gen3sid","buffer","gen3rs","scenes","sources"}: gen1-tid.json, gen2-tid.json,
//                                      gen3-sid.json, gen1-buffer.json (the compact form, decoded in the page by
//                                      buffer-decode.js), gen3-rs.json, scene-timelines.json and tid-sources.json (the
//                                      published-manipulation citations), each parsed and
//                                      re-serialised without change (tests/tid-helper/data.test.cjs deep-equals every
//                                      one against its source file and checks the sha1 rows). ONLY
//                                      scripts/gen-tid-helper-html.cjs reads it (as text); nothing in the app imports it.
//   src/offline/tidHelperData.ts       the small metadata module: per-file sha1s and sizes, the games / platforms /
//                                      methodologies with their status strings exactly as the data spells them, and the
//                                      buffer guide's coverage counts. Every string in it is the data's, verbatim.
// --check regenerates in memory and exits 1 if either committed module differs (no write).
// Re-run whenever any of the seven JSON files changes.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def; };
const check = argv.includes('--check');
const dataDir = path.resolve(opt('--data-dir', path.join(repoRoot, 'src', 'lib', 'shiny', 'data')));
const outDir = path.resolve(opt('--out-dir', path.join(mobileRoot, 'src', 'offline')));

const FILES = { gen1: 'gen1-tid.json', gen2: 'gen2-tid.json', gen2psr: 'gen2-psr.json', gen3enc: 'gen3-enc.json', gen3sid: 'gen3-sid.json', buffer: 'gen1-buffer.json', gen3rs: 'gen3-rs.json', scenes: 'scene-timelines.json', sources: 'tid-sources.json' };

const gk4 = (label) => String(label).split('/')[0];
function fail(msg) { console.error('gen-tid-helper-data: ' + msg); process.exit(1); }
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x) => typeof x === 'string' && x.length > 0;
const num = (x) => typeof x === 'number' && Number.isFinite(x);

function loadSources() {
  const files = {}, raw = {};
  for (const [key, name] of Object.entries(FILES)) {
    const p = path.join(dataDir, name);
    if (!fs.existsSync(p)) fail('missing data file ' + p);
    const bytes = fs.readFileSync(p);
    files[key] = { file: name, path: path.relative(repoRoot, p).split(path.sep).join('/'), sha1: sha1(bytes), bytes: bytes.length };
    try { raw[key] = JSON.parse(bytes.toString('utf8')); } catch (e) { fail(name + ' is not JSON: ' + e.message); }
  }
  return { files, raw };
}

// ---- validate the shapes the page relies on (loudly) --------------------------------------------------
function validate(raw) {
  const g1 = raw.gen1;
  for (const k of ['families', 'platforms', 'games', 'target_sets', 'methodologies', 'fps_expression', 'menu_to_table_frames', 'defaults', 'reset_models', 'anchor_names']) if (!(k in g1)) fail('gen1-tid.json lacks ' + k);
  if (g1.fps_expression !== '4194304/70224') fail('gen1-tid.json: unexpected fps_expression ' + JSON.stringify(g1.fps_expression));
  if (g1.menu_to_table_frames !== 80) fail('gen1-tid.json: menu_to_table_frames is ' + g1.menu_to_table_frames + ' (the engine ShinyGen1Tid holds 80)');
  for (const [id, m] of Object.entries(g1.methodologies)) {
    const td = m.table_data || {};
    if (typeof td.tids_hex !== 'string' || td.tids_hex.length !== 4 * td.rows) fail('gen1 methodology ' + id + ': tids_hex is not ' + 4 * td.rows + ' hex digits');
    if (!/^[0-9A-F]+$/.test(td.tids_hex)) fail('gen1 methodology ' + id + ': tids_hex is not upper-case hex');
    for (const k of ['status', 'name', 'protocol', 'console_name']) if (!str(m[k])) fail('gen1 methodology ' + id + ' has no ' + k);
    if (!Array.isArray(m.validity) || !m.validity.length) fail('gen1 methodology ' + id + ' has no validity list');
    if (!Array.isArray(m.anchors) || !m.anchors.length) fail('gen1 methodology ' + id + ' has no anchors');
    if (!g1.games[m.game_key]) fail('gen1 methodology ' + id + ': game_key ' + m.game_key + ' is not a game');
    for (const k of ['hold_lo_frame', 'hold_hi_frame', 'menu_frame']) if (!num((m.timing || {})[k])) fail('gen1 methodology ' + id + ': timing.' + k + ' missing');
  }
  for (const [pid, p] of Object.entries(g1.platforms)) {
    for (const k of ['name', 'status', 'validation', 'family', 'methodology', 'reset', 'reset_status']) if (!str(p[k])) fail('gen1 platform ' + pid + ' has no ' + k);
    if (!Array.isArray(p.anchors) || !p.anchors.length) fail('gen1 platform ' + pid + ' has no anchors');
    if (!g1.families[p.family]) fail('gen1 platform ' + pid + ': family ' + p.family + ' unknown');
    if (!g1.reset_models[p.reset]) fail('gen1 platform ' + pid + ': reset model ' + p.reset + ' unknown');
    if (!g1.methodologies[p.methodology]) fail('gen1 platform ' + pid + ': methodology ' + p.methodology + ' unknown');
  }
  for (const [gid, g] of Object.entries(g1.games)) {
    if (!Array.isArray(g.methodologies) || !g.methodologies.length) fail('gen1 game ' + gid + ' has no methodologies');
    for (const k of g.default_target_sets || []) if (!g1.target_sets[k]) fail('gen1 game ' + gid + ': default target set ' + k + ' unknown');
  }
  for (const [rid, r] of Object.entries(g1.reset_models)) { if (!Array.isArray(r.order) || r.order.length !== 2 || !isObj(r.paths) || !r.paths.route) fail('gen1 reset model ' + rid + ' malformed'); }
  for (const a of ['menu', 'poweron', 'reset']) { if (!str(g1.anchor_names[a])) fail('gen1 anchor_names lacks ' + a); if (!num(g1.defaults.correction_ms[a])) fail('gen1 defaults.correction_ms lacks ' + a); }

  const g2 = raw.gen2;
  for (const k of ['families', 'platforms', 'platform_keys', 'games', 'methodologies', 'rtc', 'bin_rules', 'held_input', 'target_sets', 'defaults', 'anchor_names', 'lid_rules', 'tap_frames', 'roll_settle_s', 'fps_expression']) if (!(k in g2)) fail('gen2-tid.json lacks ' + k);
  if (g2.fps_expression !== '4194304/70224') fail('gen2-tid.json: unexpected fps_expression ' + JSON.stringify(g2.fps_expression));
  if (!str(g2.held_input.rule) || !str(g2.held_input.window)) fail('gen2-tid.json: held_input.rule / window missing');
  for (const [id, m] of Object.entries(g2.methodologies)) {
    const td = m.table_data || {};
    for (const h of ['tids_hex', 'lids_hex']) if (typeof td[h] !== 'string' || td[h].length !== 4 * 599) fail('gen2 methodology ' + id + ': ' + h + ' is not 599 bins');
    for (const k of ['status', 'name', 'protocol', 'console_name', 'predicts']) if (!str(m[k])) fail('gen2 methodology ' + id + ' has no ' + k);
    if (!Array.isArray(m.validity) || !m.validity.length) fail('gen2 methodology ' + id + ' has no validity list');
    for (const k of ['hold_lo_frame', 'hold_hi_frame', 'menu_frame', 'visible_menu_frame', 'first_poll_frame']) if (!num((m.timing || {})[k])) fail('gen2 methodology ' + id + ': timing.' + k + ' missing');
    if (!g2.games[m.game_key]) fail('gen2 methodology ' + id + ': game_key ' + m.game_key + ' unknown');
    if (!g2.platform_keys[m.platform_key]) fail('gen2 methodology ' + id + ': platform_key ' + m.platform_key + ' unknown');
  }
  for (const [pid, p] of Object.entries(g2.platforms)) {
    for (const k of ['name', 'status', 'validation', 'family', 'platform_key']) if (!str(p[k])) fail('gen2 platform ' + pid + ' has no ' + k);
    if (!g2.families[p.family]) fail('gen2 platform ' + pid + ': family ' + p.family + ' unknown');
    if (!str(g2.families[p.family].hardware_validation)) fail('gen2 family ' + p.family + ' has no hardware_validation');
    if (!Array.isArray(p.anchors) || !p.anchors.length) fail('gen2 platform ' + pid + ' has no anchors');
    if (p.reset && !g1.reset_models[p.reset]) fail('gen2 platform ' + pid + ': reset model ' + p.reset + ' is not in gen1-tid.json');
  }
  if (!isObj(g2.rtc.states) || !isObj(g2.rtc.families) || !isObj(g2.rtc.tables)) fail('gen2-tid.json: rtc.states / families / tables missing');
  for (const [sid, s] of Object.entries(g2.rtc.states)) { if (!str(s.label) || !Array.isArray(s.day_bracket)) fail('gen2 rtc state ' + sid + ' malformed'); }
  for (const [gid, g] of Object.entries(g2.games)) { if (!Array.isArray(g.platform_keys) || !Array.isArray(g.ids) || !g2.bin_rules[g.bin_rule]) fail('gen2 game ' + gid + ' malformed'); }

  const g3 = raw.gen3sid;
  for (const k of ['games', 'methodologies', 'lcrng', 'gba_fps_expression']) if (!(k in g3)) fail('gen3-sid.json lacks ' + k);
  if (g3.gba_fps_expression !== '16777216/280896') fail('gen3-sid.json: unexpected gba_fps_expression');
  let sidGames = 0;
  for (const [gk, g] of Object.entries(g3.games)) {
    if (g.status === 'sid') {
      sidGames++;
      const m = g3.methodologies[g.methodology];
      if (!m) fail('gen3-sid game ' + gk + ' names methodology ' + g.methodology + ' which is absent');
      for (const k of ['status', 'name', 'protocol', 'console_name', 'target_mode']) if (!str(m[k])) fail('gen3-sid methodology ' + m.id + ' has no ' + k);
      if (!Array.isArray(m.validity) || !m.validity.length) fail('gen3-sid methodology ' + m.id + ' has no validity list');
      if (!m.model || !num(m.model.ok_to_seed) || !num(m.model.k_default_span)) fail('gen3-sid methodology ' + m.id + ' has no model.ok_to_seed / k_default_span');
      if (!isObj(m.model.variants) || !Object.keys(m.model.variants).length) fail('gen3-sid methodology ' + m.id + ' has no variants');
      for (const [vn, v] of Object.entries(m.model.variants)) {
        if (!Array.isArray(v.stages) || !isObj(v.text_speed)) fail('gen3-sid ' + m.id + ' variant ' + vn + ' lacks stages / text_speed');
        for (const [ts, t] of Object.entries(v.text_speed)) { if (!isObj(t.name_lengths) || !num(t.last_press_to_sid)) fail('gen3-sid ' + m.id + ' ' + vn + '/' + ts + ' malformed'); }
      }
    }
  }
  if (sidGames !== 3) fail('gen3-sid.json: expected 3 sid games, found ' + sidGames);

  const bf = raw.buffer;
  for (const k of ['source', 'generated', 'inputs_sha1', 'harness', 'frame_convention', 'encoding', 'grammar', 'platforms', 'windows', 'games', 'target_sets']) if (!(k in bf)) fail('gen1-buffer.json lacks ' + k);
  for (const [pid, p] of Object.entries(bf.platforms)) {
    for (const k of ['name', 'status', 'boot_rom_sha1']) if (!str(p[k])) fail('buffer platform ' + pid + ' has no ' + k);
    for (const k of ['game_start_frame', 'nintendo_logo_frame']) if (!num(p[k])) fail('buffer platform ' + pid + ' has no ' + k);
  }
  for (const [k, e] of Object.entries(bf.grammar)) for (const f of ['means', 'window', 'citation']) if (typeof e[f] !== 'string') fail('buffer grammar ' + k + ' has no ' + f);
  if (!isObj(bf.encoding.tokens) || !isObj(bf.encoding.tokens.single) || !isObj(bf.encoding.tokens.numbered)) fail('buffer encoding.tokens malformed');
  if (!str(bf.windows.note) || !isObj(bf.windows.boot) || !isObj(bf.windows.games)) fail('buffer windows block malformed');
  for (const [gk, plats] of Object.entries(bf.games)) for (const [pk, t] of Object.entries(plats)) {
    if (!bf.platforms[pk]) fail('buffer games.' + gk + '.' + pk + ': platform unknown');
    for (const k of ['source', 'verified_rows', 'checked_rows', 'harness_rows', 'tids', 'counts']) if (!(k in t)) fail('buffer games.' + gk + '.' + pk + ' lacks ' + k);
    const pk2 = t.packed;
    if (!isObj(pk2)) fail('buffer games.' + gk + '.' + pk + ' has no packed block');
    for (const k of ['seqs', 's', 'v', 'w']) if (typeof pk2[k] !== 'string') fail('buffer games.' + gk + '.' + pk + '.packed.' + k + ' is not a string');
    if (pk2.ids !== null && typeof pk2.ids !== 'string') fail('buffer games.' + gk + '.' + pk + '.packed.ids is neither null nor a string');
    const groups = pk2.seqs.split(';').length;
    if (groups !== t.tids) fail('buffer games.' + gk + '.' + pk + ': ' + groups + ' groups but tids = ' + t.tids);
    if (pk2.ids === null && groups !== 65536) fail('buffer games.' + gk + '.' + pk + ': ids null but ' + groups + ' groups');
    if (pk2.s.length !== 3 * pk2.v.length) fail('buffer games.' + gk + '.' + pk + ': s / v lengths disagree');
    if (!/^[bhl]+$/.test(pk2.v)) fail('buffer games.' + gk + '.' + pk + ': v has characters outside b/h/l');
    const wm = bf.windows.games[gk] && bf.windows.games[gk][pk];
    if (!wm || !isObj(wm.scenes) || !isObj(wm.scenes.title) || !num(wm.gamefreak_start) || !num(wm.roll_delay)) fail('buffer windows.games.' + gk + '.' + pk + ' malformed');
    for (const sc of ['gamefreak', 'intro', 'menu', 'oak']) if (!isObj(wm.scenes[sc])) fail('buffer windows.games.' + gk + '.' + pk + ' lacks scene ' + sc);
  }
  for (const [k, ts] of Object.entries(bf.target_sets)) {
    // one shape, gen1-tid.json's: name, games, and kind list with hex strings or highbyte with hi (red-2swap carries hi40-corruption's fields)
    const listy = Array.isArray(ts.tids) && ts.tids.length > 0, high = ts.kind === 'highbyte' && str(ts.hi);
    if (!str(ts.name) || !(listy || high)) fail('buffer target set ' + k + ' malformed');
    if (!Array.isArray(ts.games) || !ts.games.length || !ts.games.every((g) => bf.games[g])) fail('buffer target set ' + k + ' has no games list naming buffer games');
  }

  const rs = raw.gen3rs;
  const psr = raw.gen2psr;
  for (const k of ['games', 'fps_expression', 'frame_convention', 'buffering', 'timed_elements', 'not_derived', 'citations', 'what_this_is', 'credits', 'credit_note']) if (!(k in psr)) fail('gen2-psr.json lacks ' + k);
  // the people this methodology is built on must stay named: a page that drops them ships uncredited work
  if (!Array.isArray(psr.credits) || psr.credits.length < 5) fail('gen2-psr.json credits must list at least the five sources this rests on');
  for (const c of psr.credits) for (const k of ['who', 'role', 'what']) if (!str(c[k])) fail('gen2-psr.json credit entry lacks ' + k + ': ' + JSON.stringify(c));
  // the approach is the community's, not this project's: that credit must come first and must not be droppable
  if (!/community/i.test(psr.credits[0].who)) fail('gen2-psr.json credits must lead with the Gen 2 speedrunning community, whose methodology this is');
  if (!psr.credits.some((c) => /OceanBagel/.test(c.who))) fail('gen2-psr.json credits must thank OceanBagel, whose feedback prompted this derivation');
  // iterate EVERY game the file ships, not just crystal: a Gold or Silver table added later would
  // otherwise be published with none of the checks below ever having looked at it.
  const psrGames = [];
  for (const [gk, plats] of Object.entries(psr.games || {})) {
    if (!isObj(plats)) fail('gen2-psr.json games.' + gk + ' is not an object');
    for (const [pk, pm] of Object.entries(plats)) psrGames.push([gk + '/' + pk, pm]);
  }
  if (!psrGames.length) fail('gen2-psr.json ships no game tables at all');
  const b64len = (str) => Buffer.from(str, 'base64').length;
  for (const [label, pm] of psrGames) {
    if (!isObj(pm)) fail('gen2-psr.json ' + label + ' is not an object');
    for (const k of ['id', 'name', 'status', 'validation', 'steps', 'plateaus', 'coverage', 'code_layout', 'covered_bitmap_b64', 'script_code_b64', 'lid_b64', 'poll_period_frames', 'rolls', 'wait_max_frames', 'backout_b_frames', 'option_down_to_a_frames', 'wait_anchor']) if (!(k in pm)) fail('gen2-psr.json ' + label + ' lacks ' + k);
    // the packed tables must be exactly the sizes the page decodes, or every lookup is silently wrong
    if (b64len(pm.script_code_b64) !== 65536 * 3) fail('gen2-psr.json ' + label + ' script_code_b64 is ' + b64len(pm.script_code_b64) + ' bytes, not ' + 65536 * 3);
    if (b64len(pm.lid_b64) !== 65536 * 2) fail('gen2-psr.json ' + label + ' lid_b64 is the wrong size');
    // sid_b64 is present only for games that roll a Secret ID; absent must line up with rolls
    if (pm.rolls && pm.rolls.includes('sid')) {
      if (b64len(pm.sid_b64) !== 65536 * 2) fail('gen2-psr.json ' + label + ' rolls a Secret ID but sid_b64 is the wrong size');
    } else if (pm.sid_b64) fail('gen2-psr.json ' + label + ' does not roll a Secret ID but ships a sid_b64 table');
    if (b64len(pm.covered_bitmap_b64) !== 8192) fail('gen2-psr.json ' + label + ' covered_bitmap_b64 is the wrong size');
    // the bitmap's popcount must be the coverage number the page prints
    let pop = 0; for (const b of Buffer.from(pm.covered_bitmap_b64, 'base64')) pop += ((b * 0x08040201) >> 3 & 0x11111111) % 15;
    if (pop !== pm.coverage.tids_covered) fail('gen2-psr.json ' + label + ' coverage.tids_covered is ' + pm.coverage.tids_covered + ' but the bitmap has ' + pop + ' bits set');
    if (!num(pm.coverage.percent) || Math.abs(pm.coverage.percent - pop * 100 / 65536) > 0.01) fail('gen2-psr.json ' + label + ' coverage.percent does not match the bitmap');
    if (!Array.isArray(pm.plateaus) || !pm.plateaus.length) fail('gen2-psr.json ' + label + ' has no plateaus');
    // the (TID, LID) pair index, where a game ships one: counts and stream must line up exactly, or a
    // lookup walks off the end of the stream and returns another Trainer ID's route
    if (pm.alt_count_b64 || pm.alt_stream_b64) {
      if (!pm.alt_count_b64 || !pm.alt_stream_b64) fail('gen2-psr.json ' + label + ' ships one half of the pair index');
      const cnt = Buffer.from(pm.alt_count_b64, 'base64');
      if (cnt.length !== 65536) fail('gen2-psr.json ' + label + ' alt_count_b64 is ' + cnt.length + ' bytes, not 65536');
      let total = 0; for (const b of cnt) total += b;
      if (total !== pm.alt_pairs) fail('gen2-psr.json ' + label + ' alt_pairs says ' + pm.alt_pairs + ' but the counts sum to ' + total);
      if (b64len(pm.alt_stream_b64) !== total * 5) fail('gen2-psr.json ' + label + ' alt_stream_b64 is ' + b64len(pm.alt_stream_b64) + ' bytes, not ' + total * 5);
    } else if (pm.alt_pairs) fail('gen2-psr.json ' + label + ' claims ' + pm.alt_pairs + ' alternate pairs but ships no index');
    // extra cartridge-clock states, where a game has them. Crystal is RTC-immune and must have none.
    if (pm.rtc_tables) {
      if (gk4(label) === 'crystal') fail('gen2-psr.json crystal is RTC-immune and must not ship rtc_tables');
      for (const [state, rt] of Object.entries(pm.rtc_tables)) {
        for (const k of ['coverage', 'crosscheck', 'covered_bitmap_b64', 'script_code_b64', 'lid_b64']) if (!(k in rt)) fail('gen2-psr.json ' + label + ' rtc_tables.' + state + ' lacks ' + k);
        if (b64len(rt.script_code_b64) !== 65536 * 3 || b64len(rt.lid_b64) !== 65536 * 2 || b64len(rt.covered_bitmap_b64) !== 8192) fail('gen2-psr.json ' + label + ' rtc_tables.' + state + ' has a wrong-sized table');
        let pop2 = 0; for (const b of Buffer.from(rt.covered_bitmap_b64, 'base64')) pop2 += ((b * 0x08040201) >> 3 & 0x11111111) % 15;
        if (pop2 !== rt.coverage.tids_covered) fail('gen2-psr.json ' + label + ' rtc_tables.' + state + ' coverage does not match its bitmap');
        if (rt.crosscheck.differ_more !== 0) fail('gen2-psr.json ' + label + ' rtc_tables.' + state + ' has disagreements bigger than a few RNG steps');
      }
    }
    // whether a game rolls a Secret ID must be structural: the prose `predicts` for Gold/Silver contains
    // the phrase "Secret ID" inside the sentence saying they have none, so it cannot be substring-tested
    if (!Array.isArray(pm.rolls) || !pm.rolls.includes('tid')) fail('gen2-psr.json ' + label + ' rolls must be a list naming at least tid');
    if ((gk4(label) === 'crystal') !== pm.rolls.includes('sid')) fail('gen2-psr.json ' + label + ': only Crystal rolls a Secret ID; rolls says ' + JSON.stringify(pm.rolls));
    // the printed backout step is the one a person follows; it must not tell them to wait for the title
    const backoutStep = (pm.steps || []).find((x) => /Back out/.test(x)) || '';
    if (/until the title/i.test(backoutStep)) fail('gen2-psr.json ' + label + ' backout step tells the runner to hold B until the title screen - the harness switches to START ' + pm.backout_b_frames + ' frames in, long before the title is visible');
  }
  if (!Array.isArray(psr.timed_elements) || psr.timed_elements.length < 4) fail('gen2-psr.json timed_elements must name all four timed things (START, each backout, the OPTION gap, the wait)');
  for (const k of ['source', 'generated', 'lcrng', 'gba_fps_expression', 'frame_convention', 'live_battery_seed', 'games']) if (!(k in rs)) fail('gen3-rs.json lacks ' + k);
  if (rs.gba_fps_expression !== '16777216/280896') fail('gen3-rs.json: unexpected gba_fps_expression');
  if (rs.lcrng.mult !== '0x41C64E6D' || rs.lcrng.add !== '0x6073' || rs.lcrng.output !== 'hi16') fail('gen3-rs.json lcrng block is not the LCRNG the engine implements');
  for (const [gk, g] of Object.entries(rs.games)) {
    for (const k of ['rom_sha1', 'dead_battery_seed', 'model', 'vectors', 'status', 'methodology', 'citations']) if (!(k in g)) fail('gen3-rs game ' + gk + ' lacks ' + k);
    if (!str(g.status)) fail('gen3-rs game ' + gk + ' has no status');
    for (const k of ['formula', 'seed_frame', 'extra_advances_before_press', 'press_to_write_frames', 'vblank_advances_before_roll_on_write_frame', 'steps_to_sid_minus_press_frame', 'p_min_frames', 'p_min_frames_notes', 'anchor', 'opening_path']) if (!(k in g.model)) fail('gen3-rs game ' + gk + ' model lacks ' + k);
    const a = g.model.anchor;
    for (const k of ['first_game_frame_to_copyright_visible', 'first_game_frame_to_copyright_text_fully_visible', 'first_game_frame_to_copyright_fade_to_black_begins', 'first_game_frame_to_black_after_copyright']) if (!num(a[k])) fail('gen3-rs game ' + gk + ' anchor lacks ' + k);
    if (!str(a.notes)) fail('gen3-rs game ' + gk + ' anchor has no notes');
    if (!str(g.methodology.id) || !str(g.methodology.name) || !Array.isArray(g.methodology.protocol) || !Array.isArray(g.methodology.validity)) fail('gen3-rs game ' + gk + ' methodology lacks id / name / protocol / validity');
    if (!Array.isArray(g.vectors) || !g.vectors.length) fail('gen3-rs game ' + gk + ' has no vectors');
    for (const v of g.vectors) for (const k of ['seed', 'press_frame', 'tid', 'sid']) if (!num(v[k])) fail('gen3-rs game ' + gk + ' vector lacks ' + k);
    if (!Object.values(g.model.p_min_frames_notes).includes(g.model.p_min_frames)) fail('gen3-rs game ' + gk + ': p_min_frames is not one of p_min_frames_notes');
  }
  if (!str(rs.live_battery_seed.formula) || !Array.isArray(rs.live_battery_seed.examples) || !rs.live_battery_seed.examples.length) fail('gen3-rs.json: live_battery_seed formula / examples missing');

  const sc = raw.scenes;
  for (const k of ['source', 'fps_expression', 'frame_convention', 'methodologies', 'status', 'scene_rules']) if (!(k in sc)) fail('scene-timelines.json lacks ' + k);
  if (sc.fps_expression !== '4194304/70224') fail('scene-timelines.json: unexpected fps_expression');
  const wantIds = Object.keys(g1.methodologies).concat(Object.keys(g2.methodologies));
  for (const id of wantIds) {
    const m = sc.methodologies[id];
    if (!m) fail('scene-timelines.json has no entry for ' + id);
    if (!Array.isArray(m.scenes) || !m.scenes.length) fail('scene-timelines ' + id + ' has no scenes');
    let prevEnd = null;
    for (const s of m.scenes) {
      if (!str(s.id) || !str(s.label) || !num(s.start) || !num(s.end) || s.end < s.start) fail('scene-timelines ' + id + ' scene malformed: ' + JSON.stringify(s));
      if (prevEnd !== null && s.start !== prevEnd) fail('scene-timelines ' + id + ': scenes are not contiguous at ' + s.id + ' (' + prevEnd + ' -> ' + s.start + ')');
      prevEnd = s.end;
    }
    if (!isObj(m.events)) fail('scene-timelines ' + id + ' has no events');
    for (const k of ['hold_lo', 'hold_hi', 'menu_open', 'menu_visible', 'press_a', 'roll', 'offset_used', 'boot_logo_end', 'copyright_start']) if (!num(m.events[k])) fail('scene-timelines ' + id + ' events lack ' + k);
    if (!num(m.total_frames) || m.total_frames !== prevEnd) fail('scene-timelines ' + id + ': total_frames ' + m.total_frames + ' != last scene end ' + prevEnd);
    if (!Array.isArray(m.brightness) || m.brightness.length !== m.total_frames) fail('scene-timelines ' + id + ': brightness length != total_frames');
    const isG1 = id in g1.methodologies;
    if (isG1) {
      for (const k of ['flash', 'flash_end', 'flash_visible_start', 'flash_last_white']) if (!num(m.events[k])) fail('scene-timelines ' + id + ' (Gen 1) events lack ' + k);
      const t = g1.methodologies[id].timing;
      if (m.events.menu_open !== t.menu_frame || m.events.hold_lo !== t.hold_lo_frame || m.events.hold_hi !== t.hold_hi_frame) fail('scene-timelines ' + id + ': menu / hold frames disagree with gen1-tid.json timing');
      if (m.events.press_a !== m.events.menu_open + 1 + g1.menu_to_table_frames + m.events.offset_used) fail('scene-timelines ' + id + ': press_a is not menu_open + 1 + 80 + offset_used (frame_convention)');
    } else {
      const t = g2.methodologies[id].timing;
      if (m.events.menu_open !== t.menu_frame || m.events.menu_visible !== t.visible_menu_frame || m.events.hold_lo !== t.hold_lo_frame || m.events.hold_hi !== t.hold_hi_frame) fail('scene-timelines ' + id + ': menu / hold frames disagree with gen2-tid.json timing');
      if (!num(m.events.skip_splash)) fail('scene-timelines ' + id + ' (Gen 2) events lack skip_splash');
      if (m.events.press_a !== m.events.menu_open + 1 + m.events.offset_used) fail('scene-timelines ' + id + ': press_a is not menu_open + 1 + offset_used (press_frame_rule)');
    }
  }

  // tid-sources.json: the citation module's own check (shape, https urls, known games), plus: every game a citation
  // names is a game some page serves, and every Trainer ID cited is 4 upper-case hex digits
  const TS = require(path.join(repoRoot, 'src', 'lib', 'shiny', 'tid-sources.js'));
  try { TS.check(raw.sources); } catch (e) { fail(e.message); }
  const served = new Set(Object.keys(g1.games).concat(Object.keys(g2.games), Object.keys(g3.games), Object.keys(rs.games), ['diamond', 'pearl', 'platinum', 'heartgold', 'soulsilver', 'black', 'white', 'black2', 'white2']));
  for (const g of Object.keys(raw.sources.games)) if (!served.has(g)) fail('tid-sources.json names game ' + g + ', which no page serves');
  const seen = new Set();
  for (const e of raw.sources.entries) { const k = e.url + '|' + e.tid + '|' + e.games.join(','); if (seen.has(k)) fail('tid-sources.json: duplicate entry ' + k); seen.add(k); }
}

// ---- derived metadata (every string the data's own) --------------------------------------------------
function metadata(raw) {
  const g1 = raw.gen1, g2 = raw.gen2, g3 = raw.gen3sid, bf = raw.buffer, rs = raw.gen3rs, sc = raw.scenes;
  const gen1Games = Object.keys(g1.games).map((id) => ({
    id, name: g1.games[id].name || id, status: g1.games[id].status || '',
    methodologies: (g1.games[id].methodologies || []).map((mid) => { const m = g1.methodologies[mid]; return { id: mid, family: m.console_id, status: m.status, statusShort: m.status_short || null, anchors: m.anchors.slice(), version: m.version, date: m.date }; }),
    targetSets: (g1.games[id].target_sets || []).slice(), defaultTargetSets: (g1.games[id].default_target_sets || []).slice(),
  }));
  const gen1Platforms = Object.keys(g1.platforms).map((id) => { const p = g1.platforms[id]; return { id, name: p.name, family: p.family, status: p.status, validation: p.validation, anchors: p.anchors.slice(), reset: p.reset, resetStatus: p.reset_status }; });
  const bufferPlatforms = Object.keys(bf.platforms).map((id) => ({ id, name: bf.platforms[id].name, status: bf.platforms[id].status, bootRomSha1: bf.platforms[id].boot_rom_sha1, gameStartFrame: bf.platforms[id].game_start_frame, nintendoLogoFrame: bf.platforms[id].nintendo_logo_frame }));
  const bufferCoverage = [];
  for (const [gk, plats] of Object.entries(bf.games)) for (const [pk, t] of Object.entries(plats)) {
    const v = { list: 0, harness: 0, both: 0 };
    for (const c of t.packed.v) v[c === 'l' ? 'list' : c === 'h' ? 'harness' : 'both']++;
    bufferCoverage.push({ game: gk, platform: pk, source: t.source, verifiedRows: t.verified_rows, checkedRows: t.checked_rows, harnessRows: t.harness_rows, listRows: t.list_rows, tids: t.tids, entries: t.packed.v.length, perTid: t.per_tid, v });
  }
  const gen2Games = Object.keys(g2.games).map((id) => ({
    id, name: g2.games[id].name || id, status: g2.games[id].status || '', rtcDependent: !!g2.games[id].rtc_dependent, ids: (g2.games[id].ids || []).slice(), platformKeys: (g2.games[id].platform_keys || []).slice(),
    methodologies: (g2.games[id].methodologies || []).map((mid) => { const m = g2.methodologies[mid]; return { id: mid, platformKey: m.platform_key, status: m.status, anchors: m.anchors.slice(), version: m.version, date: m.date }; }),
    targetSets: (g2.games[id].target_sets || []).slice(), defaultTargetSets: (g2.games[id].default_target_sets || []).slice(),
  }));
  const gen2Platforms = Object.keys(g2.platforms).map((id) => { const p = g2.platforms[id]; return { id, name: p.name, family: p.family, platformKey: p.platform_key, status: p.status, validation: p.validation, anchors: p.anchors.slice(), reset: p.reset || null, hardwareValidation: g2.families[p.family].hardware_validation }; });
  const gen3RsGames = Object.keys(rs.games).map((id) => { const g = rs.games[id], m = g.model; return { id, methodologyId: g.methodology.id, name: g.methodology.name, status: g.status, romSha1: g.rom_sha1, deadBatterySeed: g.dead_battery_seed, pMinFrames: m.p_min_frames, pMinNotes: m.p_min_frames_notes, stepsToSidMinusPressFrame: m.steps_to_sid_minus_press_frame, biosMeasured: !!(m.anchor && m.anchor.bios_measured), anchorNotes: m.anchor.notes, vectors: g.vectors.length }; });
  const gen3SidGames = Object.keys(g3.games).map((id) => { const g = g3.games[id], m = g3.methodologies[g.methodology] || null; return { id, name: g.name, dataStatus: g.status, methodologyId: g.methodology, status: m ? m.status : null, modelStatus: m && m.model ? m.model.status || null : null, consoleName: m ? m.console_name : null, targetMode: m ? m.target_mode || null : null }; });
  const scenes = Object.keys(sc.methodologies).map((id) => ({ id, scenes: sc.methodologies[id].scenes.length, totalFrames: sc.methodologies[id].total_frames, offsetUsed: sc.methodologies[id].events.offset_used }));
  const src = raw.sources, tidKeys = new Set();
  for (const e of src.entries) if (e.tid !== null) for (const g of e.games) tidKeys.add(g + ':' + e.tid);
  const sourceCounts = { entries: src.entries.length, documentedTids: tidKeys.size, games: Object.keys(src.games) };
  return { gen1Games, gen1Platforms, bufferPlatforms, bufferCoverage, gen2Games, gen2Platforms, gen3RsGames, gen3SidGames, scenes, scenesStatus: sc.status, bufferSource: bf.source, bufferFrameConvention: bf.frame_convention, sourceCounts };
}

// ---- emit ----------------------------------------------------------------------------------------------
function build() {
  const { files, raw } = loadSources();
  validate(raw);
  const combined = { gen1: raw.gen1, gen2: raw.gen2, gen2psr: raw.gen2psr, gen3enc: raw.gen3enc, gen3sid: raw.gen3sid, buffer: raw.buffer, gen3rs: raw.gen3rs, scenes: raw.scenes, sources: raw.sources };
  const minified = JSON.stringify(combined);
  const literal = JSON.stringify(minified).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const jsonSha1 = sha1(minified);
  const meta = metadata(raw);
  const relJson = 'src/offline/tidHelperDataJson.ts', relMeta = 'src/offline/tidHelperData.ts';
  const fileRows = Object.entries(files).map(([k, f]) => '//   ' + k.padEnd(8) + f.sha1 + '  ' + String(f.bytes).padStart(9) + '  ' + f.path).join('\n');
  const jsonModule = [
    '// GENERATED by hackmons-mobile/scripts/gen-tid-helper-data.cjs - do not edit.',
    '// The eight shared Trainer ID data files as ONE JSON string {"gen1","gen2","gen2psr","gen3sid","buffer","gen3rs","scenes","sources"} (sha1 of the string ' + jsonSha1 + '):',
    fileRows,
    '// Each file is parsed and re-serialised unchanged (tests/tid-helper/data.test.cjs deep-equals every member against its source file).',
    '// Read as TEXT by scripts/gen-tid-helper-html.cjs to inline the data into the "Get a TID" page as window.TID_HELPER_DATA;',
    '// NOT imported by the app (the page already carries the copy inside tidHelperHtml).',
    'export const tidHelperDataJson: string = ' + literal + ';',
    '',
  ].join('\n');
  const metaModule = [
    '// GENERATED by hackmons-mobile/scripts/gen-tid-helper-data.cjs - do not edit.',
    '// Sources (sha1 / bytes), the shared Trainer ID data generated from RNG Solution:',
    fileRows,
    '// The JSON itself is in ' + relJson + ' (tidHelperDataJson), which only scripts/gen-tid-helper-html.cjs reads. This module',
    '// carries what the React Native side may print before the page loads; every status / validation string below is the data\'s,',
    '// verbatim (the anti-retype scan in tests/tid-helper/html.test.cjs excludes this generated file for that reason).',
    '// tests/tid-helper/data.test.cjs recomputes every export from the sources.',
    '',
    'export interface TidHelperSourceFile { file: string; path: string; sha1: string; bytes: number; }',
    'export const tidHelperDataSources: Record<"gen1" | "gen2" | "gen2psr" | "gen3enc" | "gen3sid" | "buffer" | "gen3rs" | "scenes" | "sources", TidHelperSourceFile> = ' + JSON.stringify(files) + ';',
    'export const tidHelperDataJsonSha1 = ' + JSON.stringify(jsonSha1) + ';',
    'export const tidHelperDataJsonModule = ' + JSON.stringify(relJson) + ';',
    'export interface TidHelperGen1Methodology { id: string; family: string; status: string; statusShort: string | null; anchors: string[]; version: number; date: string; }',
    'export interface TidHelperGen1Game { id: string; name: string; status: string; methodologies: TidHelperGen1Methodology[]; targetSets: string[]; defaultTargetSets: string[]; }',
    'export const tidHelperGen1Games: TidHelperGen1Game[] = ' + JSON.stringify(meta.gen1Games) + ';',
    'export interface TidHelperGen1Platform { id: string; name: string; family: string; status: string; validation: string; anchors: string[]; reset: string; resetStatus: string; }',
    'export const tidHelperGen1Platforms: TidHelperGen1Platform[] = ' + JSON.stringify(meta.gen1Platforms) + ';',
    'export interface TidHelperBufferPlatform { id: string; name: string; status: string; bootRomSha1: string; gameStartFrame: number; nintendoLogoFrame: number; }',
    'export const tidHelperBufferPlatforms: TidHelperBufferPlatform[] = ' + JSON.stringify(meta.bufferPlatforms) + ';',
    'export interface TidHelperBufferCoverage { game: string; platform: string; source: string; verifiedRows: number; checkedRows: number; harnessRows: number; listRows: number; tids: number; entries: number; perTid: number; v: { list: number; harness: number; both: number }; }',
    'export const tidHelperBufferCoverage: TidHelperBufferCoverage[] = ' + JSON.stringify(meta.bufferCoverage) + ';',
    'export const tidHelperBufferSource = ' + JSON.stringify(meta.bufferSource) + ';',
    'export const tidHelperBufferFrameConvention = ' + JSON.stringify(meta.bufferFrameConvention) + ';',
    'export interface TidHelperGen2Methodology { id: string; platformKey: string; status: string; anchors: string[]; version: number; date: string; }',
    'export interface TidHelperGen2Game { id: string; name: string; status: string; rtcDependent: boolean; ids: string[]; platformKeys: string[]; methodologies: TidHelperGen2Methodology[]; targetSets: string[]; defaultTargetSets: string[]; }',
    'export const tidHelperGen2Games: TidHelperGen2Game[] = ' + JSON.stringify(meta.gen2Games) + ';',
    'export interface TidHelperGen2Platform { id: string; name: string; family: string; platformKey: string; status: string; validation: string; anchors: string[]; reset: string | null; hardwareValidation: string; }',
    'export const tidHelperGen2Platforms: TidHelperGen2Platform[] = ' + JSON.stringify(meta.gen2Platforms) + ';',
    'export interface TidHelperGen3RsGame { id: string; methodologyId: string; name: string; status: string; romSha1: string; deadBatterySeed: number; pMinFrames: number; pMinNotes: Record<string, number>; stepsToSidMinusPressFrame: number; biosMeasured: boolean; anchorNotes: string; vectors: number; }',
    'export const tidHelperGen3RsGames: TidHelperGen3RsGame[] = ' + JSON.stringify(meta.gen3RsGames) + ';',
    'export interface TidHelperGen3SidGame { id: string; name: string; dataStatus: string; methodologyId: string; status: string | null; modelStatus: string | null; consoleName: string | null; targetMode: string | null; }',
    'export const tidHelperGen3SidGames: TidHelperGen3SidGame[] = ' + JSON.stringify(meta.gen3SidGames) + ';',
    'export interface TidHelperSceneEntry { id: string; scenes: number; totalFrames: number; offsetUsed: number; }',
    'export const tidHelperScenes: TidHelperSceneEntry[] = ' + JSON.stringify(meta.scenes) + ';',
    'export const tidHelperScenesStatus = ' + JSON.stringify(meta.scenesStatus) + ';',
    'export interface TidHelperSourceCounts { entries: number; documentedTids: number; games: string[]; }',
    'export const tidHelperSourceCounts: TidHelperSourceCounts = ' + JSON.stringify(meta.sourceCounts) + ';',
    '',
  ].join('\n');
  return { files, jsonModule, metaModule, jsonSha1, meta };
}

function main() {
  const { files, jsonModule, metaModule, jsonSha1, meta } = build();
  const jsonPath = path.join(outDir, 'tidHelperDataJson.ts'), metaPath = path.join(outDir, 'tidHelperData.ts');
  if (check) {
    let stale = 0;
    for (const [p, want] of [[jsonPath, jsonModule], [metaPath, metaModule]]) {
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      if (cur !== want) { console.error('STALE: ' + p + ' differs from the generator output'); stale++; }
    }
    if (stale) process.exit(1);
    console.log('OK: both data modules are up to date (JSON string sha1 ' + jsonSha1 + ')');
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, jsonModule);
  fs.writeFileSync(metaPath, metaModule);
  console.log('sources:');
  for (const [k, f] of Object.entries(files)) console.log('  ' + k.padEnd(8) + f.sha1 + '  ' + String(f.bytes).padStart(9) + '  ' + f.path);
  console.log('buffer coverage: ' + meta.bufferCoverage.map((c) => c.game + '/' + c.platform + ' ' + c.tids + ' tids, ' + c.entries + ' entries (b ' + c.v.both + ' / h ' + c.v.harness + ' / l ' + c.v.list + ')').join('; '));
  console.log('wrote ' + path.relative(mobileRoot, jsonPath) + ' (' + Buffer.byteLength(jsonModule) + ' bytes, JSON string sha1 ' + jsonSha1 + ') and ' + path.relative(mobileRoot, metaPath) + ' (' + Buffer.byteLength(metaModule) + ' bytes)');
}
main();
