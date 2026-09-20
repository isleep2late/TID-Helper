// smoke.test.cjs - the generated page in headless Chrome. Run: node --test tests/tid-helper/*.test.cjs
//   The page is BUILT from the sources by scripts/gen-tid-helper-html.cjs into a temp dir (--html-out) and loaded from a
//   file:// URL with the RN bridge stubbed (window.ReactNativeWebView.postMessage -> window.__posted). Asserted:
//   'ready' is posted once; the injected init (the protocol's buildInjectScript shape) is received; the home screen shows
//   every game with its methods and a status line that is the data's; Red -> buffer guide -> 16589 renders the first step,
//   25794 shows entrpntr's video as the Original source and a click on it posts open-url instead of navigating
//   with the grammar's text for pal(hold); the storyboard canvas exists and a preview ticks on the cue clock; prefs are
//   posted; no exception reaches the console. If Chrome cannot run here the test is SKIPPED with the reason (never faked).
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

test('headless Chrome: ready, init, home, Red -> buffer guide -> 16589 -> first step, storyboard preview', { skip: avail.ok ? false : 'cannot run headless Chrome: ' + avail.reason }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidhelper-page-'));
  const out = path.join(dir, 'tidHelperHtml.ts'), html = path.join(dir, 'index.html');
  const r = spawnSync(process.execPath, [path.join(H.MOBILE, 'scripts', 'gen-tid-helper-html.cjs'), '--out', out, '--html-out', html], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'page built: ' + r.stderr);
  const D = H.data();
  try {
    await C.withPage('file://' + html, async (page) => {
      let posted = [];
      for (let i = 0; i < 100; i++) { posted = await page.evalJson('JSON.stringify(window.__posted)').then(JSON.parse); if (posted.some((m) => m.type === 'ready')) break; await C.sleep(100); }
      assert.equal(posted.filter((m) => m.type === 'ready').length, 1, 'ready posted once: ' + JSON.stringify(posted));
      assert.equal(await page.evalJson('window.__tidHelperError == null'), true, 'no boot error');
      // the protocol's inject script shape (tidHelperProtocol.ts buildInjectScript), verbatim
      await page.evalJson("(function(){var m={\"type\":\"init\",\"platformOS\":\"android\",\"prefs\":{\"cue\":{\"flash\":false}}};try{if(window.TidHelperBridge&&typeof window.TidHelperBridge.receive===\"function\"){window.TidHelperBridge.receive(m);}else{(window.__tidHelperQueue=window.__tidHelperQueue||[]).push(m);}}catch(e){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:\"error\",message:\"bridge receive threw: \"+(e&&e.message)}));}}})();true;");
      assert.equal(await page.evalJson('TidHelperApp.initReceived'), true);
      assert.equal(await page.evalJson('TidHelperApp.platformOS'), 'android');
      assert.equal(await page.evalJson('TidHelperApp.pref("cue","flash",true)'), false, 'the init prefs are in force');
      // home: every game card with its methods; the status line under each method is the data's
      const home = await page.evalJson('JSON.stringify(Array.from(document.querySelectorAll(".choice.mode")).map(function(b){return [b.getAttribute("data-game"), b.getAttribute("data-mode"), b.querySelector(".clamp").textContent]}))').then(JSON.parse);
      // Every game the home screen offers, and exactly which methods. Hand-maintained ON PURPOSE: a derived
      // list would pass however wrong the page got. It had gone stale while this whole test sat skipped
      // (node 18 has no global WebSocket, so it cannot drive Chrome) - it still expected Red to have two
      // methods after sc-metronome made three, and it missed the Gen 4 and Gen 5 games entirely, which is
      // how both of those shipped registering nothing at all. Adding a method means updating this line.
      const want = { red: ['gen1-buffer', 'gen1-timed', 'sc-metronome'], blue: ['gen1-timed', 'sc-metronome'] /* no community list for Blue: no buffer guide */, yellow: ['gen1-buffer', 'gen1-timed', 'sc-metronome'],
        gold: ['gen2', 'gen2-psr', 'sc-metronome'], silver: ['gen2', 'gen2-psr', 'sc-metronome'], crystal: ['gen2', 'gen2-psr', 'sc-metronome'],
        ruby: ['gen3-rs', 'gen3-enc'], sapphire: ['gen3-rs', 'gen3-enc'], emerald: ['gen3-sid'], firered: ['gen3-sid'], leafgreen: ['gen3-sid'],
        diamond: ['gen4'], pearl: ['gen4'], platinum: ['gen4'], heartgold: ['gen4'], soulsilver: ['gen4'],
        black: ['gen5'], white: ['gen5'], black2: ['gen5'], white2: ['gen5'] };
      for (const [g, modes] of Object.entries(want)) assert.deepEqual(home.filter((h) => h[0] === g).map((h) => h[1]), modes, g + ' methods');
      const line = (g, m) => home.find((h) => h[0] === g && h[1] === m)[2];
      assert.equal(line('red', 'gen1-buffer'), D.buffer.platforms.gbp.status);
      assert.equal(line('red', 'gen1-timed'), D.gen1.methodologies['red/gba/hold-start-v1'].status);
      assert.equal(line('gold', 'gen2'), D.gen2.methodologies['gold/gbp/hold-start-v1'].status);
      assert.equal(line('ruby', 'gen3-rs'), D.gen3rs.games.ruby.status);
      assert.equal(line('emerald', 'gen3-sid'), D.gen3sid.methodologies['emerald/gba/typed-tid-sid-v1'].status);
      // Red -> buffer guide -> 16589
      await page.evalJson('document.querySelector(".choice.mode[data-game=red][data-mode=gen1-buffer]").click(); true');
      assert.deepEqual(await page.evalJson('JSON.stringify(window.__tidHelperScreen)').then(JSON.parse), { screen: 'mode', game: 'red', mode: 'gen1-buffer' });
      await page.evalJson('var i=document.getElementById("buffer-tid"); i.value="16589"; i.dispatchEvent(new Event("input",{bubbles:true})); true');
      for (let i = 0; i < 50 && !(await page.evalJson('!!document.querySelector("#buffer-results ol.steps li")')); i++) await C.sleep(100);
      const seq = await page.evalJson('document.querySelector("#buffer-results .mono").textContent');
      assert.equal(seq, 'pal(hold)_gfskip_hop0_title1_newgame');
      const first = await page.evalJson('document.querySelector("#buffer-results ol.steps li").textContent');
      assert.ok(first.startsWith('pal(hold)'), 'first step is the palette token: ' + first.slice(0, 40));
      assert.ok(first.includes(D.buffer.grammar['pal(hold)'].means) && first.includes(D.buffer.grammar['pal(hold)'].window), 'the first step text is the grammar\'s means and window');
      // the first sequence only: the table carries up to two per Trainer ID since the fastest-first ranking
      const steps = await page.evalJson('JSON.stringify(Array.from(document.querySelector("#buffer-results ol.steps").querySelectorAll("li .st")).map(function(e){return e.textContent}))').then(JSON.parse);
      assert.deepEqual(steps, ['pal(hold)', 'gfskip', 'hop0', 'title1', 'newgame']);
      const tag = await page.evalJson('document.querySelector("#buffer-results .card .tag").textContent');   // the sequence card's tag, not the source block's
      assert.ok(tag.includes(H.page('page-gen1-buffer.js').verificationText(D, 'b')), 'verification tag is the data\'s wording: ' + tag);
      // 16589 has no published manipulation: the source block says Community list (a b row), never Original source
      const src16589 = await page.evalJson('document.querySelector("#buffer-results .src").textContent');
      assert.ok(src16589.includes(D.sources.labels.community.label) && src16589.includes(D.sources.labels.community.text), 'community-list source block: ' + src16589.slice(0, 80));
      // 25794 (0x64C2) is documented: the block names entrpntr's video first, as a link the app can hand to the browser
      await page.evalJson('var i=document.getElementById("buffer-tid"); i.value="25794"; i.dispatchEvent(new Event("input",{bubbles:true})); true');
      for (let i = 0; i < 50 && !(await page.evalJson('!!document.querySelector("#buffer-results .src a[data-ext]")')); i++) await C.sleep(100);
      const srcDoc = await page.evalJson('JSON.stringify({label: document.querySelector("#buffer-results .src .tag").textContent, cls: document.querySelector("#buffer-results .src .tag").className, href: document.querySelector("#buffer-results .src a[data-ext]").getAttribute("href"), title: document.querySelector("#buffer-results .src a[data-ext]").textContent})').then(JSON.parse);
      assert.equal(srcDoc.label, D.sources.labels.documented.label); assert.equal(srcDoc.cls, 'tag ok');
      assert.equal(srcDoc.href, 'https://www.youtube.com/watch?v=Jh7Z_frbfNs'); assert.match(srcDoc.title, /0x64C2/);
      // inside the app the link is not followed: the page posts open-url and the screen opens the browser
      await page.evalJson('document.querySelector("#buffer-results .src a[data-ext]").click(); true');
      const opened = await page.evalJson('JSON.stringify(window.__posted.filter(function(m){return m.type==="open-url"}))').then(JSON.parse);
      assert.deepEqual(opened, [{ type: 'open-url', url: 'https://www.youtube.com/watch?v=Jh7Z_frbfNs' }]);
      assert.equal(await page.evalJson('location.href.indexOf("youtube") === -1'), true, 'the WebView did not navigate away');
      assert.equal(await page.evalJson('!!document.querySelector("#main h3") && Array.from(document.querySelectorAll("#main h3")).some(function(h){return h.textContent==="Sources"})'), true, 'the Sources card is on the page');
      await page.evalJson('var i=document.getElementById("buffer-tid"); i.value="16589"; i.dispatchEvent(new Event("input",{bubbles:true})); true');
      for (let i = 0; i < 50 && (await page.evalJson('document.querySelector("#buffer-results .mono").textContent')) !== 'pal(hold)_gfskip_hop0_title1_newgame'; i++) await C.sleep(100);
      // the status block shows the platform status verbatim and the fixed validity sentence
      const status = await page.evalJson('document.querySelector("#main .status").textContent');
      assert.ok(status.includes(D.buffer.platforms.gbp.status) && status.includes('Predictions are valid only under this methodology.'));
      // the storyboard: canvas present, preview ticks on the cue engine clock
      assert.equal(await page.evalJson('!!document.getElementById("bstory-0-canvas")'), true);
      await page.evalJson('document.querySelector("[data-story=\\"bstory-0\\"][data-act=preview]").click(); true');
      await C.sleep(700);
      assert.equal(await page.evalJson('TidHelperCue.running'), true, 'preview running');
      const t1 = await page.evalJson('TidHelperCue.elapsed()');
      await C.sleep(400);
      const t2 = await page.evalJson('TidHelperCue.elapsed()');
      assert.ok(t2 > t1, 'the storyboard clock advances: ' + t1 + ' -> ' + t2);
      assert.equal(await page.evalJson('JSON.stringify(TidHelperCue.run.tickError || null)'), 'null', 'no error inside the draw tick');
      assert.match(await page.evalJson('document.getElementById("runclock").textContent'), /^T[+-]\d+\.\d\d s/);
      await page.evalJson('TidHelperCue.stop(); true');
      // prefs were posted (typed TID, navigation) with the contract's shape
      const prefs = await page.evalJson('JSON.stringify(window.__posted.filter(function(m){return m.type==="prefs"}).pop())').then(JSON.parse);
      assert.equal(prefs.prefs.buffer.tid, '16589'); assert.deepEqual(prefs.prefs.nav, { game: 'red', mode: 'gen1-buffer' });
      const bad = page.log.filter((l) => /^\[exception\]|^\[console\.error\]/.test(l));
      assert.deepEqual(bad, [], 'no exceptions or console errors');
      const types = new Set((await page.evalJson('JSON.stringify(window.__posted.map(function(m){return m.type}))').then(JSON.parse)));
      for (const t of types) assert.ok(['ready', 'prefs', 'log', 'error', 'audio-unavailable', 'open-shiny', 'open-url'].includes(t), 'posted type in the contract: ' + t);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
