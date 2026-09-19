// calibration.test.cjs - the calibration block of the generated page in headless Chrome. Run: node --test tests/tid-helper/*.test.cjs
//   Red -> Gen 1 timed -> GBP / menu anchor -> aim 358; two attempts are run and recorded with TIDs that the engine's
//   table gives for offsets 361 and 356. With n >= 2 the block prints the spread and the engine's P(hit); asserted: the
//   P(hit) text is a percentage (A.pct of ShinyGen1Tid.hitProbabilityHeadline(...).p) with the 'phase-averaged' qualifier
//   the site prints under five samples, and equals what the engine gives for the block's own sd / n. A regression guard:
//   the block once concatenated the engine's {p, centred} object and printed '[object Object]'. Skipped (never faked)
//   when headless Chrome cannot run here.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const H = require('./helpers.cjs');
const C = require('./chrome.cjs');

const avail = C.chromeAvailable();

test('calibration block: two recorded samples print P(hit) as a percentage, never [object Object]', { skip: avail.ok ? false : 'cannot run headless Chrome: ' + avail.reason }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidhelper-cal-'));
  const out = path.join(dir, 'tidHelperHtml.ts'), html = path.join(dir, 'index.html');
  const r = spawnSync(process.execPath, [path.join(H.MOBILE, 'scripts', 'gen-tid-helper-html.cjs'), '--out', out, '--html-out', html], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'page built: ' + r.stderr);
  const D = H.data(), E = H.engines(), T1 = H.page('page-gen1-timed.js');
  const ctx = T1.context(D, E.G1, 'red', 'gbp');
  const tidAt = (o) => E.G1.tableEntries(ctx.table).find((e) => e[0] === o)[1];
  try {
    await C.withPage('file://' + html, async (page) => {
      for (let i = 0; i < 100; i++) { if (await page.evalJson('window.__posted.some(function(m){return m.type==="ready"})')) break; await C.sleep(100); }
      await page.evalJson("window.TidHelperBridge.receive({type:'init',platformOS:'ios',prefs:null}); true");
      await page.evalJson('TidHelperApp.go("mode","red","gen1-timed"); true');
      await C.sleep(50);
      const click = async (sel) => { assert.equal(await page.evalJson('!!document.querySelector(\'' + sel + '\')'), true, 'present: ' + sel); await page.evalJson('document.querySelector(\'' + sel + '\').click(); true'); await C.sleep(80); };
      await click('.choice[data-choice="g1-platform"][data-id="gbp"]');
      await click('.choice[data-choice="g1-anchor"][data-id="menu"]');
      await click('[data-g1-aim="358"]');
      // one sample: no spread line yet (haveSd needs n >= 2)
      const calText = () => page.evalJson('document.getElementById("g1-cal").innerText');
      for (const o of [361, 356]) {
        await click('[data-story=g1-story][data-act=run]');
        await C.sleep(150);
        await page.evalJson('TidHelperCue.stop(); true');
        await page.evalJson('document.getElementById("g1-cal-got").value = "' + tidAt(o) + '"; true');
        await click('[data-cal=g1-cal][data-act=submit]');
        await C.sleep(150);
        if (o === 361) assert.doesNotMatch(await calText(), /P\(hit\)/, 'no P(hit) with a single sample');
      }
      const text = await calText();
      assert.doesNotMatch(text, /\[object Object\]/, 'the headline object is not concatenated: ' + text);
      const m = text.match(/P\(hit\): (\d+ %) \((centred on the frame|phase-averaged: fewer than 5 samples)\)\./);
      assert.ok(m, 'P(hit) is printed as a percentage with the qualifier: ' + text.replace(/\n+/g, ' | '));
      assert.equal(m[2], 'phase-averaged: fewer than 5 samples', 'two samples are fewer than five');
      // the number is the engine's for the block's own samples
      // the store key is platform + anchor (page-gen1-timed.js ctxFor): 'gen1.gbp.menu'
      const samples = await page.evalJson('JSON.stringify(TidHelperApp.cal("gen1.gbp.menu").samples)').then(JSON.parse);
      assert.equal(samples.length, 2, 'two samples recorded');
      const stats = E.G1.anchorStats(E.G1.splitByMethodology(samples, ctx.methId).kept);
      const head = E.G1.hitProbabilityHeadline(stats.sdMs, stats.n, E.G1.FRAME_MS);
      assert.equal(typeof head.p, 'number');
      assert.equal(m[1], (100 * head.p).toFixed(0) + ' %', 'the printed P(hit) is the engine\'s');
      assert.equal(head.centred, false);
      const bad = page.log.filter((l) => /^\[exception\]|^\[console\.error\]/.test(l));
      assert.deepEqual(bad, [], 'no exceptions or console errors');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
