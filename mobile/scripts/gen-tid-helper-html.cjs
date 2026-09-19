// Generates src/offline/tidHelperHtml.ts: the "Get a TID" WebView page as one template-string export.
//
// Inlined, in this order: ../src/lib/shiny/rng.js, gen1tid.js, gen2tid.js (the site's engines, UMD: each browser branch
// needs the previous one), ../src/lib/shiny/buffer-decode.js (RNG Solution's decoder for the compact gen1-buffer.json),
// ../src/lib/shiny/tid-sources.js (the published-manipulation citations lookup), the seven data files as window.TID_HELPER_DATA (read as TEXT from src/offline/tidHelperDataJson.ts, the data generator's
// output; the app never imports that module), then the page scripts from src/offline/tid-helper/ into page.html's slots.
// The generated header lists every input's sha1 and size, plus the sha1 of the canonical JSON string that is inlined, so
// a reviewer's `sha1sum` of the sources matches the rows.
//
//   node scripts/gen-tid-helper-html.cjs [--out path] [--html-out path] [--check]
//
// --check regenerates in memory and exits 1 if the committed .ts differs (no write). No npm script is added for this on
// purpose: package.json "scripts" is part of the OTA fingerprint.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOBILE = path.resolve(__dirname, '..');
const SITE_SHINY = path.resolve(MOBILE, '../src/lib/shiny');
const PAGE_DIR = path.join(MOBILE, 'src/offline/tid-helper');
const ENGINES = ['rng.js', 'gen1tid.js', 'gen2tid.js', 'generators.js', 'buffer-decode.js', 'tid-sources.js'];
const PAGE_SCRIPTS = ['page-app.js', 'page-cue.js', 'page-storyboard.js', 'page-widgets.js', 'page-gen1-buffer.js', 'page-gen1-timed.js', 'page-gen2.js', 'page-gen2-psr.js', 'page-gen3-rs.js', 'page-gen3-sid.js', 'page-gen3-enc.js', 'page-sc-metronome.js', 'page-render.js'];
const DATA_TS = path.join(MOBILE, 'src/offline/tidHelperDataJson.ts');
const DATA_KEYS = ['gen1', 'gen2', 'gen2psr', 'gen3enc', 'gen3sid', 'buffer', 'gen3rs', 'scenes', 'sources'];

// The name column, with at least one space always left before the sha1: a name exactly as wide as
// the column used to run into the hash, and the header row the tests parse then stopped matching.
function pad(name) { return name.length >= 20 ? name + ' ' : name.padEnd(20); }

function parseArgs(argv) {
  const o = { out: path.join(MOBILE, 'src/offline/tidHelperHtml.ts'), htmlOut: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--html-out') o.htmlOut = path.resolve(argv[++i]);
    else if (a === '--check') o.check = true;
    else throw new Error('unknown argument ' + a);
  }
  return o;
}
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const read = (p) => { if (!fs.existsSync(p)) throw new Error('missing input: ' + p); return fs.readFileSync(p, 'utf8'); };

// the data module's one export is a JSON string literal holding the combined object; lift it out as text
function dataFromTs(src) {
  const m = /export const tidHelperDataJson: string = (".*");\n/.exec(src);
  if (!m) throw new Error(DATA_TS + ': no tidHelperDataJson string export found');
  const jsonText = JSON.parse(m[1]);
  const data = JSON.parse(jsonText);
  for (const k of DATA_KEYS) if (!data[k] || typeof data[k] !== 'object') throw new Error(DATA_TS + ': the data has no ' + k);
  if (!data.gen2psr.games || !data.gen2psr.games.crystal || !data.gen2psr.games.crystal.gbp) throw new Error(DATA_TS + ': gen2-psr.json has no games.crystal.gbp');
  if (!data.gen1.methodologies || !data.gen2.methodologies || !data.buffer.games || !data.gen3rs.games || !data.scenes.methodologies || !data.gen3sid.methodologies) throw new Error(DATA_TS + ': a data block lacks its main table');
  return { jsonText, data };
}

// inside <script>: a literal "</" would close the element; "<\/" is the same text to the JS parser
const scriptSafe = (s) => s.replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const tsLiteral = (html) => '`' + html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

function build() {
  const inputs = {}, scripts = {};
  const add = (name, file) => {
    const text = read(file);
    inputs[name] = { file: path.relative(MOBILE, file), sha1: sha1(text), bytes: Buffer.byteLength(text) };
    scripts[name] = text;
  };
  for (const e of ENGINES) add(e, path.join(SITE_SHINY, e));
  const dataSrc = read(DATA_TS);
  const { jsonText } = dataFromTs(dataSrc);
  inputs['data-module'] = { file: path.relative(MOBILE, DATA_TS), sha1: sha1(dataSrc), bytes: Buffer.byteLength(dataSrc) };
  inputs['data-json'] = { file: '(the JSON string in ' + path.relative(MOBILE, DATA_TS) + ', inlined as window.TID_HELPER_DATA = JSON.parse(...))', sha1: sha1(jsonText), bytes: Buffer.byteLength(jsonText) };
  // JSON.parse of a string literal parses faster than an object literal of this size in every engine; the literal is the
  // JSON string escaped once more (JSON.stringify), so the page sees the same bytes the data generator emitted
  scripts.data = 'window.TID_HELPER_DATA = JSON.parse(' + JSON.stringify(jsonText) + ');';
  for (const s of PAGE_SCRIPTS) add(s, path.join(PAGE_DIR, s));
  const pageHtml = read(path.join(PAGE_DIR, 'page.html'));
  inputs['page.html'] = { file: path.relative(MOBILE, path.join(PAGE_DIR, 'page.html')), sha1: sha1(pageHtml), bytes: Buffer.byteLength(pageHtml) };
  let html = pageHtml;
  const fill = (name, body, shaRow) => {
    const marker = '<!--@@SCRIPT:' + name + '@@-->';
    if (!html.includes(marker)) throw new Error('page.html has no ' + marker);
    html = html.replace(marker, () => '<script>\n// ---- ' + name + ' (sha1 ' + shaRow.slice(0, 12) + ') ----\n' + scriptSafe(body) + '\n</script>');
  };
  for (const e of ENGINES) fill(e, scripts[e], inputs[e].sha1);
  fill('data', scripts.data, inputs['data-json'].sha1);
  for (const s of PAGE_SCRIPTS) fill(s, scripts[s], inputs[s].sha1);
  const left = /<!--@@SCRIPT:[^@]*@@-->/.exec(html);
  if (left) throw new Error('unfilled slot ' + left[0]);
  const header = '// GENERATED by scripts/gen-tid-helper-html.cjs: do not edit. Edit src/offline/tid-helper/* and re-run.\n' +
    '// Inputs (sha1 / bytes):\n' + Object.entries(inputs).map(([k, v]) => '//   ' + pad(k) + v.sha1 + '  ' + String(v.bytes).padStart(8) + '  ' + v.file).join('\n') + '\n' +
    '// The page runs in a WebView from a file:// URL (TidHelperScreen stages it into the cache directory); everything is inlined,\n' +
    '// it fetches nothing. The RN side sets originWhitelist [\'*\'], allowFileAccessFromFileURLs (iOS and Android), allowFileAccess +\n' +
    '// allowUniversalAccessFromFileURLs (Android); see src/utils/tidHelperProtocol.ts for the message contract.\n';
  const ts = header + 'export const tidHelperHtml = ' + tsLiteral(html) + ';\n';
  return { ts, html, inputs };
}

// prove the escape round-trips: evaluate the literal exactly as TypeScript/JS would
function roundTrip(ts, html) {
  const key = 'export const tidHelperHtml = ';
  const i = ts.indexOf(key);
  const lit = ts.slice(i + key.length).replace(/;\n$/, '');
  const back = new Function('return ' + lit)();
  if (back !== html) throw new Error('template-literal round-trip mismatch (' + back.length + ' vs ' + html.length + ' chars)');
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const { ts, html, inputs } = build();
  roundTrip(ts, html);
  if (opt.check) {
    const cur = fs.existsSync(opt.out) ? fs.readFileSync(opt.out, 'utf8') : '';
    if (cur !== ts) { console.error('STALE: ' + opt.out + ' differs from the generator output'); process.exit(1); }
    console.log('OK: ' + opt.out + ' is up to date (' + Buffer.byteLength(ts) + ' bytes)');
    return;
  }
  fs.writeFileSync(opt.out, ts);
  if (opt.htmlOut) fs.writeFileSync(opt.htmlOut, html);
  console.log('inputs:');
  for (const [k, v] of Object.entries(inputs)) console.log('  ' + pad(k) + v.sha1 + '  ' + String(v.bytes).padStart(8) + '  ' + v.file);
  console.log('wrote ' + opt.out + ' (' + Buffer.byteLength(ts) + ' bytes, html ' + Buffer.byteLength(html) + ' bytes, round-trip verified)' + (opt.htmlOut ? '\nwrote ' + opt.htmlOut : ''));
}
main();
