// helpers.cjs - what the TID Helper tests share: paths, the eight source JSON files (parsed from <repo>/src/lib/shiny/data,
// the single sources of truth), the engines (the site's rng.js / gen1tid.js / gen2tid.js and RNG Solution's
// buffer-decode.js, from the same directory the HTML generator inlines them from) and the page's UMD modules.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOBILE = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(MOBILE, '..');
const DATA_DIR = path.join(REPO, 'src', 'lib', 'shiny', 'data');
const SHINY = path.join(REPO, 'src', 'lib', 'shiny');
const PAGE_DIR = path.join(MOBILE, 'src', 'offline', 'tid-helper');
const FILES = { gen1: 'gen1-tid.json', gen2: 'gen2-tid.json', gen2psr: 'gen2-psr.json', gen3enc: 'gen3-enc.json', gen3sid: 'gen3-sid.json', buffer: 'gen1-buffer.json', gen3rs: 'gen3-rs.json', gen4: 'gen4-tid.json', gen5: 'gen5-tid.json', scenes: 'scene-timelines.json', sources: 'tid-sources.json' };
const PAGE_SCRIPTS = ['page-app.js', 'page-cue.js', 'page-storyboard.js', 'page-widgets.js', 'page-gen1-buffer.js', 'page-gen1-timed.js', 'page-gen2.js', 'page-gen2-psr.js', 'page-gen3-rs.js', 'page-gen3-sid.js', 'page-gen3-enc.js', 'page-gen4.js', 'page-gen5.js', 'page-sc-metronome.js', 'page-render.js'];

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
let cache = null;
function sources() {
  if (cache) return cache;
  const raw = {}, bytes = {};
  for (const [k, f] of Object.entries(FILES)) { bytes[k] = fs.readFileSync(path.join(DATA_DIR, f)); raw[k] = JSON.parse(bytes[k].toString('utf8')); }
  cache = { raw, bytes, sha1s: Object.fromEntries(Object.entries(bytes).map(([k, b]) => [k, sha1(b)])) };
  return cache;
}
function data() { return sources().raw; }
function engines() {
  return { core: require(path.join(SHINY, 'rng.js')), G1: require(path.join(SHINY, 'gen1tid.js')), G2: require(path.join(SHINY, 'gen2tid.js')), BD: require(path.join(SHINY, 'buffer-decode.js')), TS: require(path.join(SHINY, 'tid-sources.js')),
           G4: require(path.join(SHINY, 'gen4.js')), ST4: require(path.join(SHINY, 'seedtime4.js')), G5: require(path.join(SHINY, 'gen5.js')) };
}
function page(name) { return require(path.join(PAGE_DIR, name)); }
// the app module bound to the data and engines (the pure part; no DOM)
function app() {
  const A = page('page-app.js');
  if (!A.D) A.bindData(data(), engines());
  return A;
}
// the data module's JSON string, lifted out of the generated TypeScript as text (the way the HTML generator reads it)
function dataModuleJson() {
  const src = fs.readFileSync(path.join(MOBILE, 'src', 'offline', 'tidHelperDataJson.ts'), 'utf8');
  const m = /export const tidHelperDataJson: string = (".*");\n/.exec(src);
  if (!m) throw new Error('tidHelperDataJson.ts: no string export');
  return { src, jsonText: JSON.parse(m[1]) };
}
module.exports = { MOBILE, REPO, DATA_DIR, SHINY, PAGE_DIR, FILES, PAGE_SCRIPTS, sha1, sources, data, engines, page, app, dataModuleJson };
