// chrome.cjs - a headless-Chrome helper for the TID Helper tests: the launch / connect / evaluate code of
// tests/tid-guesser/chrome-harness.cjs (which is a CLI, not a module) as functions, on the same Chrome binary and
// flags, over the DevTools protocol with Node 22's built-in WebSocket and fetch (no npm packages).
//   const { chromeAvailable, withPage } = require('./chrome.cjs');
//   await withPage(fileUrl, async (page) => { await page.evalJson('1+1'); page.log; });
// chromeAvailable() says whether the binary exists AND node has a global WebSocket; a test that cannot run says so
// (test.skip with the reason) rather than passing vacuously.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const CHROME = process.env.TID_HELPER_CHROME || '/usr/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromeAvailable() {
  // A SKIP HERE IS NOT FREE. These are the only tests that boot the real page, and on 2026-09-20 the live
  // site shipped broken twice in one day while the suite was green, because this skipped silently on the
  // default node 18. The reason now says what to do about it rather than only what is wrong.
  if (typeof WebSocket !== 'function') return { ok: false, reason: 'node ' + process.version + ' has no global WebSocket (need node 22+). '
    + 'These are the ONLY tests that boot the real page - run them with a node 22+ on PATH (npm run test:tid-helper:browser) before trusting a green suite' };
  if (!fs.existsSync(CHROME)) return { ok: false, reason: 'no Chrome binary at ' + CHROME };
  return { ok: true, reason: '' };
}
async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer(); s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
async function launchChrome() {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'tidhelper-chrome-'));
  const port = await freePort();
  const args = ['--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio', '--no-first-run', '--disable-extensions',
    '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files',
    `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--window-size=420,900', 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  let targets = null;
  for (let i = 0; i < 200 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(100); }
  }
  if (!targets) { proc.kill('SIGKILL'); throw new Error('chrome did not come up on port ' + port + ': ' + stderr.slice(-800)); }
  const page = targets.find((t) => t.type === 'page');
  if (!page) { proc.kill('SIGKILL'); throw new Error('no page target'); }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { proc, udd, port, wsUrl: page.webSocketDebuggerUrl, browser: version.Browser, stderr: () => stderr };
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error ' + (e && e.message))); });
  let id = 0; const pending = new Map(); const log = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') log.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value !== undefined ? String(a.value) : a.description || a.type).join(' '));
    if (m.method === 'Runtime.exceptionThrown') log.push('[exception] ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded') log.push(`[${m.params.entry.source}/${m.params.entry.level}] ` + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  const evalJson = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('evaluate threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value === undefined ? null : r.result.value;
  };
  return { ws, send, log, evalJson };
}
// withPage(url, fn): launches Chrome, opens url, waits for the load event, runs fn(page), always kills Chrome
async function withPage(url, fn, opts = {}) {
  const chrome = await launchChrome();
  try {
    const page = await connect(chrome.wsUrl);
    page.browser = chrome.browser;
    // the RN bridge stub: postMessage from the page lands in window.__posted
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: opts.preScript || 'window.__posted = []; window.ReactNativeWebView = { postMessage: function (s) { window.__posted.push(JSON.parse(s)); } };' });
    await page.send('Page.navigate', { url });
    for (let i = 0; i < 300; i++) { if ((await page.evalJson('document.readyState')) === 'complete') break; await sleep(100); }
    return await fn(page);
  } finally {
    try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ }
    try { fs.rmSync(chrome.udd, { recursive: true, force: true }); } catch { /* leave it */ }
  }
}
module.exports = { CHROME, chromeAvailable, launchChrome, connect, withPage, sleep };
