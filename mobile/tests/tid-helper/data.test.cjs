// data.test.cjs - the two generated data modules embed the eight source JSON files without change. Run: node --test tests/tid-helper/*.test.cjs
//   1. tidHelperDataJson.ts: the JSON string parses to {gen1, gen2, gen2psr, gen3sid, buffer, gen3rs, scenes} and every member deep-equals its
//      source file (parsed), and the module's sha1 rows are the sha1s of the source bytes;
//      (the seventh member, tid-sources.json, is the citation registry the pages print beside every Trainer ID);
//   2. tidHelperData.ts: every export is recomputed here from the sources (statuses verbatim, buffer coverage from the packed v strings);
//   3. the generator's --check passes (the committed modules are what the sources give).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const H = require('./helpers.cjs');

const ts = require(path.join(H.MOBILE, 'node_modules', 'typescript'));
function loadMeta() {
  const src = fs.readFileSync(path.join(H.MOBILE, 'src', 'offline', 'tidHelperData.ts'), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', out)(() => { throw new Error('tidHelperData.ts must not import anything'); }, m, m.exports);
  return { src, exports: m.exports };
}

test('tidHelperDataJson.ts: one string, ten members, each deep-equal to its source file; sha1 rows match the source bytes', () => {
  const { src, jsonText } = H.dataModuleJson();
  const combined = JSON.parse(jsonText);
  assert.deepEqual(Object.keys(combined), ['gen1', 'gen2', 'gen2psr', 'gen3enc', 'gen3sid', 'buffer', 'gen3rs', 'gen4', 'gen5', 'scenes', 'sources']);
  const S = H.sources();
  for (const k of Object.keys(H.FILES)) {
    assert.deepEqual(combined[k], S.raw[k], k + ' is embedded verbatim (deep-equal to ' + H.FILES[k] + ')');
    assert.ok(src.includes('//   ' + k.padEnd(8) + S.sha1s[k] + '  ' + String(S.bytes[k].length).padStart(9) + '  src/lib/shiny/data/' + H.FILES[k]), 'sha1 row for ' + k + ' is the source file\'s sha1 and size');
  }
  assert.ok(src.includes('sha1 of the string ' + H.sha1(jsonText)), 'the header names the sha1 of the embedded JSON string');
  assert.equal((src.match(/export const/g) || []).length, 1, 'exactly one export');
  assert.ok(!/\u2028|\u2029/.test(src), 'no raw line separators in the literal');
});

test('tidHelperData.ts: every export recomputed from the sources', () => {
  const { exports: M } = loadMeta();
  const S = H.sources(), D = S.raw;
  for (const k of Object.keys(H.FILES)) {
    assert.equal(M.tidHelperDataSources[k].sha1, S.sha1s[k], k + ' sha1');
    assert.equal(M.tidHelperDataSources[k].bytes, S.bytes[k].length, k + ' bytes');
    assert.equal(M.tidHelperDataSources[k].file, H.FILES[k]);
  }
  assert.equal(M.tidHelperDataJsonSha1, H.sha1(H.dataModuleJson().jsonText));
  // gen1 games / methodologies: status strings verbatim
  for (const g of M.tidHelperGen1Games) {
    assert.equal(g.name, D.gen1.games[g.id].name);
    assert.deepEqual(g.methodologies.map((m) => m.id), D.gen1.games[g.id].methodologies);
    for (const m of g.methodologies) { assert.equal(m.status, D.gen1.methodologies[m.id].status); assert.equal(m.statusShort, D.gen1.methodologies[m.id].status_short || null); assert.deepEqual(m.anchors, D.gen1.methodologies[m.id].anchors); }
    assert.deepEqual(g.defaultTargetSets, D.gen1.games[g.id].default_target_sets || []);
  }
  assert.deepEqual(M.tidHelperGen1Platforms.map((p) => p.id), Object.keys(D.gen1.platforms));
  for (const p of M.tidHelperGen1Platforms) { assert.equal(p.status, D.gen1.platforms[p.id].status); assert.equal(p.validation, D.gen1.platforms[p.id].validation); assert.equal(p.resetStatus, D.gen1.platforms[p.id].reset_status); }
  // buffer platforms and coverage
  assert.deepEqual(M.tidHelperBufferPlatforms.map((p) => p.id), Object.keys(D.buffer.platforms));
  for (const p of M.tidHelperBufferPlatforms) { assert.equal(p.status, D.buffer.platforms[p.id].status); assert.equal(p.gameStartFrame, D.buffer.platforms[p.id].game_start_frame); assert.equal(p.nintendoLogoFrame, D.buffer.platforms[p.id].nintendo_logo_frame); }
  let seen = 0;
  for (const [gk, plats] of Object.entries(D.buffer.games)) for (const [pk, t] of Object.entries(plats)) {
    const c = M.tidHelperBufferCoverage.find((x) => x.game === gk && x.platform === pk);
    assert.ok(c, 'coverage row for ' + gk + '/' + pk);
    seen++;
    const v = { list: 0, harness: 0, both: 0 };
    for (const ch of t.packed.v) v[ch === 'l' ? 'list' : ch === 'h' ? 'harness' : 'both']++;
    assert.deepEqual(c.v, v, gk + '/' + pk + ' v counts from the packed v string');
    assert.equal(c.tids, t.tids); assert.equal(c.entries, t.packed.v.length); assert.equal(c.source, t.source); assert.equal(c.verifiedRows, t.verified_rows); assert.equal(c.harnessRows, t.harness_rows); assert.equal(c.perTid, t.per_tid);
  }
  assert.equal(M.tidHelperBufferCoverage.length, seen);
  assert.equal(M.tidHelperBufferSource, D.buffer.source);
  assert.equal(M.tidHelperBufferFrameConvention, D.buffer.frame_convention);
  // gen2
  assert.deepEqual(M.tidHelperGen2Games.map((g) => g.id), Object.keys(D.gen2.games));
  for (const g of M.tidHelperGen2Games) { assert.equal(g.rtcDependent, !!D.gen2.games[g.id].rtc_dependent); for (const m of g.methodologies) assert.equal(m.status, D.gen2.methodologies[m.id].status); }
  for (const p of M.tidHelperGen2Platforms) { assert.equal(p.status, D.gen2.platforms[p.id].status); assert.equal(p.validation, D.gen2.platforms[p.id].validation); assert.equal(p.hardwareValidation, D.gen2.families[D.gen2.platforms[p.id].family].hardware_validation); }
  // gen3 rs / sid
  assert.deepEqual(M.tidHelperGen3RsGames.map((g) => g.id), Object.keys(D.gen3rs.games));
  for (const g of M.tidHelperGen3RsGames) { const src = D.gen3rs.games[g.id]; assert.equal(g.status, src.status); assert.equal(g.methodologyId, src.methodology.id); assert.equal(g.pMinFrames, src.model.p_min_frames); assert.deepEqual(g.pMinNotes, src.model.p_min_frames_notes); assert.equal(g.stepsToSidMinusPressFrame, src.model.steps_to_sid_minus_press_frame); assert.equal(g.vectors, src.vectors.length); assert.equal(g.anchorNotes, src.model.anchor.notes); }
  assert.deepEqual(M.tidHelperGen3SidGames.map((g) => g.id), Object.keys(D.gen3sid.games));
  for (const g of M.tidHelperGen3SidGames) { const m = D.gen3sid.methodologies[g.methodologyId]; assert.equal(g.status, m ? m.status : null); assert.equal(g.dataStatus, D.gen3sid.games[g.id].status); }
  // scenes
  assert.deepEqual(M.tidHelperScenes.map((s) => s.id), Object.keys(D.scenes.methodologies));
  for (const s of M.tidHelperScenes) { assert.equal(s.totalFrames, D.scenes.methodologies[s.id].total_frames); assert.equal(s.scenes, D.scenes.methodologies[s.id].scenes.length); assert.equal(s.offsetUsed, D.scenes.methodologies[s.id].events.offset_used); }
  assert.equal(M.tidHelperScenesStatus, D.scenes.status);
});

test('gen-tid-helper-data.cjs --check: the committed modules are what the sources give', () => {
  const r = spawnSync(process.execPath, [path.join(H.MOBILE, 'scripts', 'gen-tid-helper-data.cjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'exit 0: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /^OK: both data modules are up to date/);
});
