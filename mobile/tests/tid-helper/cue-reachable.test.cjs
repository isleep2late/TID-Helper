// cue-reachable.test.cjs - every mode, on every game it serves, either offers the runner a cue or tells them,
// in words naming something that is on the page in front of them, how to get one.
//
// WHY THIS FILE EXISTS. The owner reported that the cue "isn't showing up". An audit of all mode/game
// combinations found three where a runner arriving with default settings had no route to a cue at all: Gen 2
// timed tap on Crystal, and the Ruby/Sapphire dead-battery mode on both of its games. In each case the cue card
// printed "Pick a target to build the cue" while the tab the mode opens on had nothing to pick - the target-set
// list is empty for those games - so the sentence could only be followed by a runner who already knew to switch
// tabs. Every per-mode test in this directory passed throughout, because each one reached into A.prefs and
// installed a target before rendering: they asked "does a chosen target produce a cue", which was never the
// question. Nothing asked "does the page hand the runner a way to choose one".
//
// So this file walks the page the way a person does. It renders a mode's own render() into a stand-in document,
// scrapes the controls the page actually drew, and clicks them through the same delegation page-render.js uses,
// with the shared cue engine (page-cue.js) wired to a stand-in audio device that counts the tones scheduled on
// it. A cue counts as reachable when tones really reach that device - not when a marker appears in the markup -
// so a cue widget that renders but cannot build its program does not pass.
//
// It is driven off A.order and mode.games, never a list written here, so a new mode or a new game is covered
// the day it is registered. Writing it that way turned up a fourth combination of the same shape that the
// audit had missed, because the audit installed a target before asking: Gen 1 timed on Yellow. No offset of
// any platform's table produces a member of psr-yellow - the only target set whose games list names Yellow -
// so the Route targets tab the mode opens on is empty, and the cue card under it says "Pick a target to build
// the cue" with nothing anywhere on the page to pick. The mode does play a cue on that page, the
// save-corruption reset metronome, which is why nothing had noticed: a mode having *a* cue is not the same as
// its target cue being reachable, and the second assertion below keeps the two apart.
//
// Run: node --test tests/tid-helper/cue-reachable.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');

// ---- the stand-in device -------------------------------------------------------------------------------
// page-cue.js schedules a tone as one oscillator started at an absolute AudioContext time, and the SC
// Metronome schedules its beats the same way on A.Cue.ctx rather than through Cue.start. Counting oscillators
// catches both without this file knowing which mode does which.
const tones = [];
// The whole AudioParam surface the two tone builders use - page-cue.js's beepAt ramps linearly, the SC
// Metronome's beep() ramps exponentially. A missing method here throws inside the builder BEFORE the
// oscillator is started, which reads exactly like a mode with no cue: the first cut of this file reported all
// six SC Metronome games as cue-less for that reason alone.
class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  setValueCurveAtTime() { return this; }
  cancelScheduledValues() { return this; }
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0; this.sampleRate = 48000; this.state = 'running';
    this.destination = {}; this.baseLatency = 0.01; this.outputLatency = 0.01;
  }
  resume() { this.state = 'running'; }
  close() { this.state = 'closed'; }
  createOscillator() { return { type: '', frequency: new FakeParam(), connect() {}, start(at) { tones.push(at); }, stop() {} }; }
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createBuffer() { return {}; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
}
globalThis.AudioContext = FakeAudioContext;
// page-cue.js's tick() and the SC Metronome's flash loop both drive themselves off the animation frame; under
// node there is none, and a cue that cannot schedule its first frame would look like a cue that does not exist.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
// The SC Metronome does not schedule its beats when Start is pressed: it arms the device and then fills a
// 0.15 s lookahead window from a 25 ms timer. Held here so the window can be pumped by hand - and so no timer
// outlives the test run.
const timers = [];
globalThis.setInterval = (fn) => { timers.push(fn); return { lookahead: timers.length }; };
globalThis.clearInterval = () => {};
globalThis.document = { getElementById: () => null };

const H = require('./helpers.cjs');
const A = H.app();
globalThis.TidHelperApp = A;            // how a page module finds the app in the browser
A.render = () => {};                    // page-render.js owns the real one; this file re-renders by hand
// page-widgets.js is the one page module with no UMD wrapper: it reads its cue engine and storyboard off the
// window globals the <script> tags leave behind, so those are put in place before it is loaded.
A.Cue = globalThis.TidHelperCue = H.page('page-cue.js');
A.Story = globalThis.TidHelperStoryboard = H.page('page-storyboard.js');
A.widgets = null;
// Everything the page ships except page-render.js, whose boot() wants a real document; its click delegation is
// mirrored below instead. The list comes from helpers.cjs, so a new module is loaded here when it is added.
for (const f of H.PAGE_SCRIPTS) { if (f !== 'page-render.js') H.page(f); }
assert.ok(A.widgets && typeof A.widgets.onStoryClick === 'function', 'page-widgets.js installed the real widgets');
const D = H.data();

// mountStory is the one widget entry point wrapped rather than used as shipped: the real one registers the spec
// (which is what onStoryClick needs) and then draws on a canvas that does not exist here.
const mounted = [];
const realMountStory = A.widgets.mountStory;
A.widgets.mountStory = (spec) => { mounted.push(spec); return realMountStory(spec); };

// The calibration block is fenced off so the prose reader below can cut it out. It is the "what did you get?"
// flow - what a runner does AFTER an attempt - and it always carries an instruction naming its own field
// ("type the Trainer ID you got"). Counted as prose, that one sentence made every mode with a calibration
// block look as though it had told the runner how to get a cue, which is how the first cut of this file passed
// Gen 1 timed on Yellow: a game with no route-valid target at all, whose cue card says "Pick a target to build
// the cue" over a tab that has none.
const CAL_OPEN = '[[calibration]]', CAL_CLOSE = '[[/calibration]]';
const realCalibrationHtml = A.widgets.calibrationHtml;
A.widgets.calibrationHtml = function () { return CAL_OPEN + realCalibrationHtml.apply(this, arguments) + CAL_CLOSE; };

// ---- driving a mode ------------------------------------------------------------------------------------
const snapshot = () => JSON.parse(JSON.stringify(A.prefs));
function reset() { A.prefs = { version: 1 }; A.widgets.reset(); A.widgets.clearCalMsgs(); mounted.length = 0; }
function render(id, game) { mounted.length = 0; const el = { innerHTML: '' }; A.modes[id].render(el, game); return el.innerHTML; }

// a selector the page modules actually use: [data-x] or [data-x="v"], matched against one element's attributes
function matchesSel(attrs, sel) {
  const m = /^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]$/.exec(String(sel).trim());
  if (!m || !(m[1] in attrs)) return false;
  return m[2] === undefined || attrs[m[1]] === m[2];
}
function nodeFor(attrs) {
  const node = { getAttribute: (a) => (a in attrs ? attrs[a] : null), tagName: 'BUTTON', id: attrs.id || '' };
  node.closest = (sel) => (matchesSel(attrs, sel) ? node : null);
  return node;
}
// page-render.js's onClick: a [data-story] or [data-cal] button is the widgets' and never reaches the mode;
// everything else is the mode's. Mirrored so this file tests the routing the app really performs.
function click(id, game, attrs) {
  const node = nodeFor(attrs);
  if ('data-story' in attrs) { A.widgets.onStoryClick(node); return null; }
  if ('data-cal' in attrs) { A.widgets.onCalClick(node); return null; }
  return A.modes[id].onEvent({ type: 'click', timeStamp: 1000, target: node }, game);
}
function input(id, game, elId, value) {
  return A.modes[id].onEvent({ type: 'input', target: { id: elId, value: String(value), tagName: 'SELECT', getAttribute: () => null, closest: () => null } }, game);
}
// the tones an act schedules, counted on the stand-in device, with the metronome's lookahead window pumped
function tonesFrom(act) {
  tones.length = 0; timers.length = 0;
  A.Cue.ctx = null; A.Cue.armed = false; A.Cue.audioErr = null;
  try { act(); } catch (e) { return { n: 0, err: A.errMsg ? A.errMsg(e) : e.message }; }
  const clock = A.Cue.ctx;
  for (let i = 0; i < 8 && timers.length; i++) {
    if (clock) clock.currentTime = i * 0.2;
    timers.forEach((fn) => { try { fn(); } catch (e) { /* a stalled lookahead is not a cue */ } });
  }
  try { A.widgets.stopAll(); } catch (e) { /* nothing playing */ }
  return { n: tones.length, err: null };
}

// ---- what the page drew --------------------------------------------------------------------------------
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (s) => unesc(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function attrsOf(tag) { const o = {}; for (const m of tag.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) o[m[1]] = unesc(m[2]); return o; }
// A.choices() wraps the control's name in .ct and its status line in .cs; only the name is what an instruction
// would call it by, so a platform's whole validation paragraph is not treated as a label.
function buttonLabel(inner) { const m = /<span class="ct">([\s\S]*?)<\/span>/.exec(inner); return text(m ? m[1] : inner); }
function buttons(html) {
  const out = [];
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = attrsOf(m[1]);
    if (!Object.keys(attrs).some((k) => k.startsWith('data-'))) continue;
    if ('disabled' in attrs) continue;
    out.push({ attrs, label: buttonLabel(m[2]) });
  }
  return out;
}
function selects(html) {
  const out = [];
  for (const m of html.matchAll(/<select id="([^"]*)">([\s\S]*?)<\/select>/g)) {
    const before = html.slice(0, m.index);
    const lm = /<label class="field">([^<]*)$/.exec(before);
    out.push({ id: unesc(m[1]), label: text(lm ? lm[1] : ''),
      options: [...m[2].matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map((o) => ({ value: unesc(o[1]), label: text(o[2]) })) });
  }
  return out;
}
function fieldLabels(html) {
  return [...html.matchAll(/<label class="field">([^<]*)<(?:input|select)\b/g)].map((m) => text(m[1]));
}
// What an instruction can call a control by. A label's head - the part before the parenthesis or colon that
// qualifies it - is the name; "Trainer ID wanted (decimal or $hex)" is the Trainer ID field. Single words are
// dropped: an anchor named "menu" or "reset" would otherwise be "named" by any protocol line that mentions
// pressing one, and the point of this check is that the runner is being pointed at a control.
function controlNames(html) {
  const raw = [].concat(buttons(html).map((b) => b.label), selects(html).map((s) => s.label), fieldLabels(html));
  const names = new Set();
  for (const label of raw) {
    const head = label.split(/[(:]/)[0].trim();
    if (head.length >= 5 && head.split(/\s+/).length >= 2) names.add(head);
  }
  return [...names];
}
// The page's own prose, with every control stripped out first: a tab reading "Typed IDs" must not make the
// sentence beside it look as though it named one.
function prose(html) {
  const stripped = html
    .split(CAL_OPEN).map((part, i) => (i === 0 ? part : part.slice(part.indexOf(CAL_CLOSE) + 1))).join(' ')
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, ' ')
    .replace(/<select\b[^>]*>[\s\S]*?<\/select>/g, ' ')
    .replace(/<label class="field">[\s\S]*?<\/label>/g, ' ')
    .replace(/<input\b[^>]*>/g, ' ')
    // Every block ends a sentence. Without this a heading runs into the paragraph under it, and "2. Press cue
    // (optional: pins k to a window)" followed by a tool credit reads as one enormous sentence that mentions a
    // cue and an imperative and is neither.
    .replace(/<\/(h[1-6]|p|li|td|th|div|details|summary|ul|ol|table|tr)>/g, '. ');
  return flat(text(stripped));
}
// One spelling for a run of sentence ends, so the "." this function inserts at every block boundary cannot make
// the page's own prose differ from the same words read out of the data.
function flat(s) { return String(s).replace(/\s*\.(?:\s*\.)+/g, '.').replace(/\s+/g, ' ').trim(); }
// Verbs that tell the runner to operate the page. "press" and "tap" are deliberately absent: they are what the
// protocol prose says about the console ("press A on frame P"), not about this page, and including them made
// every mode's protocol card look like an instruction about the cue.
const IMPERATIVE = /\b(pick|choose|type|open|switch|select|enter|capture|widen|aim at|go to)\b/i;
function sentences(html) { return prose(html).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean); }
function instructions(html) { return sentences(html).filter((s) => IMPERATIVE.test(s)); }
// an instruction the runner can carry out where they are standing: it calls a control by a name the page has
// actually drawn on this view
function actionable(html) {
  const names = controlNames(html);
  const found = [];
  for (const s of instructions(html)) {
    for (const n of names) if (s.toLowerCase().includes(n.toLowerCase())) found.push({ sentence: s, control: n });
  }
  return found;
}
// A sentence in which the page itself says a cue has still to be built. This is the sentence the three known
// gaps were made of: "Pick a target to build the cue" printed over a tab with nothing on it to pick.
// The word has to be the page's own noun, not a command-line flag: gen3-sid quotes RNG Solution's CLI
// ("a window of a few k with 'sid --cue'"), which is prose about another tool and promises nothing here.
function cuePromises(html) { return instructions(html).filter((s) => /(?<![-\w])cues?\b/i.test(s) && !/--/.test(s)); }
// The house rule is that where something has not been derived the page says so instead of guessing, and a
// game with no model is not a gap in the page. The SC Metronome states it for the Gen 2 games in as many
// words - gen1-tid.json's reset_models cover the Gen 1 games only, so there is no interval to beat and the
// mode asks the runner to measure their own. A statement like that counts only when it names the game it is
// about, so it cannot be satisfied by an unrelated caveat elsewhere on a long page.
const NOT_DERIVED = /\b(not been measured|nobody has measured|never been (measured|derived)|not( been)? derived|no model for|has no model|offers none rather than inventing|not in this file)\b/i;
function statedGap(html, game) {
  const named = new RegExp('\\b' + game.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  return sentences(html).filter((s) => NOT_DERIVED.test(s) && named.test(s));
}

// ---- is a cue reachable from here? ---------------------------------------------------------------------
// Every button on the page is tried, each from the same starting state, and the question asked of each is
// whether the shared cue engine ends up scheduling tones. Nothing here knows which button is a cue button.
function cueOnPage(id, game, html) {
  const specs = mounted.slice();
  const before = snapshot();
  for (const b of buttons(html)) {
    A.prefs = JSON.parse(JSON.stringify(before));
    mounted.length = 0; mounted.push(...specs);
    const r = tonesFrom(() => click(id, game, b.attrs));
    A.prefs = JSON.parse(JSON.stringify(before));
    if (r.n > 0) return { ok: true, how: JSON.stringify(b.label) + ' schedules ' + r.n + ' tone' + (r.n === 1 ? '' : 's') };
  }
  A.prefs = before;
  mounted.length = 0; mounted.push(...specs);
  return { ok: false };
}
// One act, from the default view: a click on a control the page drew, or a pick from one of its dropdowns.
// Typing is deliberately not simulated - a Trainer ID is knowledge the runner brings, not something the page
// hands them - so a mode that can only be cued by typing has to say so in words, which is the check below.
function oneStepActs(html) {
  const acts = [];
  for (const b of buttons(html)) acts.push({ kind: 'click', label: b.label, run: (id, game) => click(id, game, b.attrs) });
  for (const s of selects(html)) for (const o of s.options) {
    if (o.value === '') continue;                       // the "(choose)" placeholder is not a choice
    acts.push({ kind: 'pick', label: (s.label || s.id) + ' -> ' + o.label, run: (id, game) => input(id, game, s.id, o.value) });
  }
  return acts;
}
// The whole walk for one mode/game, done once: the page the runner arrives on, whether a cue is already there,
// every page one act away from it, and which of those acts ends in a cue.
function walk(id, game) {
  reset();
  const first = render(id, game);
  const here = cueOnPage(id, game, first);
  const out = { html: first, ok: here.ok, via: here.ok ? 'on arrival: ' + here.how : null, steps: [] };
  for (const act of oneStepActs(first)) {
    reset();
    render(id, game);
    let html;
    try { act.run(id, game); html = render(id, game); } catch (e) { continue; }
    const r = cueOnPage(id, game, html);
    out.steps.push({ label: act.kind + ' ' + JSON.stringify(act.label), html, cue: r.ok });
    if (r.ok && !out.ok) { out.ok = true; out.via = 'one ' + act.kind + ' - ' + JSON.stringify(act.label) + ' - then ' + r.how; }
  }
  reset();
  return out;
}
const walked = new Map();
function walkOf(id, game) {
  const key = id + '/' + game;
  if (!walked.has(key)) walked.set(key, walk(id, game));
  return walked.get(key);
}

// ---- the one mode that must NOT have a cue --------------------------------------------------------------
// gen3-enc manipulates an encounter by advancing the RNG, and how many advances separate a press a person can
// see from the frame the encounter is generated has never been measured: gen3-enc.json's not_derived[0] says
// so outright, and says only an emulator could produce it, one number per game, boot path, map and save. A cue
// there would be a wall-clock claim with no model under it, so the mode offers none and says why instead. The
// assertion is inverted for it: if a cue ever appears in this mode, either somebody derived the relationship -
// in which case this entry comes out and the data says what was derived - or a number was invented.
const NO_CUE_BY_DESIGN = { 'gen3-enc': { why: 'the advance-to-wall-clock relationship has never been derived for Ruby and Sapphire', says: () => D.gen3enc.not_derived[0] } };

test('the guard covers every registered mode and every game it serves', () => {
  assert.ok(A.order.length > 0, 'modes registered');
  for (const id of A.order) {
    const mode = A.modes[id];
    assert.ok(mode, id + ' is in A.order and in A.modes');
    assert.ok(Array.isArray(mode.games) && mode.games.length, id + ' serves at least one game');
    assert.equal(typeof mode.render, 'function', id + ' renders');
  }
  for (const id of Object.keys(NO_CUE_BY_DESIGN)) {
    assert.ok(A.modes[id], 'the named no-cue exception ' + id + ' is still a registered mode; if it was renamed or ' +
      'removed, move the exception with it rather than leaving a mode uncovered');
  }
});

for (const id of A.order) {
  for (const game of A.modes[id].games) {
    const except = NO_CUE_BY_DESIGN[id];
    if (except) {
      test(id + ' / ' + game + ': offers no cue, and says why', () => {
        const r = walkOf(id, game);
        assert.equal(r.ok, false, id + ' offers a cue on ' + game + ' (' + r.via + '), but ' + except.why +
          '. Either the model has been derived - in which case the data must say so and this exception must come out - or the cue is inventing one.');
        const owed = except.says();
        assert.ok(prose(r.html).includes(flat(text(owed))),
          id + ' / ' + game + ': the page must carry the data\'s own statement that the relationship is not derived, so the runner is told why there is no cue rather than left to wonder. Missing: ' + JSON.stringify(text(owed).slice(0, 80)));
      });
      continue;
    }
    test(id + ' / ' + game + ': a cue is reachable, or the page says how to get one', () => {
      const r = walkOf(id, game);
      if (!r.ok) {
        // No cue from where the runner is standing, so the page owes them either an instruction they can act on
        // here, or the plain statement that this game has no model for one.
        const acts = actionable(r.html);
        const gap = statedGap(r.html, game);
        assert.ok(acts.length > 0 || gap.length > 0,
          id + ' / ' + game + ': no cue is reachable from the page the runner arrives on, and nothing on it tells them ' +
          'what to do about that. The instructions the page prints are ' + JSON.stringify(instructions(r.html).slice(0, 6)) +
          ' and the controls it drew are ' + JSON.stringify(controlNames(r.html)) + '. Either give this view something ' +
          'that builds a cue, name the control that does, or say plainly that this game has no model for one.');
      }
      // Whether or not a cue is reachable: every sentence in which the page says a cue has still to be built
      // must be one the runner can act on from here - it names a control that is on the page, or a single act
      // on this page makes the sentence go away by building the cue it promises. This is the assertion the
      // three known gaps failed: "Pick a target to build the cue" over a tab with nothing on it to pick.
      const promises = cuePromises(r.html);
      if (promises.length) {
        const names = controlNames(r.html);
        // The promises are taken together, not one at a time: a page may well say "there is nothing on this tab
        // to pick" in one sentence and "open Typed IDs instead" in the next, and only the second names a
        // control. What is not allowed is a page that promises a cue and never says, anywhere in those
        // sentences, which control builds it.
        const named = promises.filter((promise) => names.some((n) => promise.toLowerCase().includes(n.toLowerCase())));
        const built = promises.filter((promise) => r.steps.some((s) => s.cue && !cuePromises(s.html).includes(promise)));
        assert.ok(named.length > 0 || built.length > 0,
          id + ' / ' + game + ': the page says ' + JSON.stringify(promises[0]) + ' and the runner cannot do it from ' +
          'here. No control on this page is called by a name any of those sentences uses, and no single act on the page ' +
          'builds the cue they promise' + (r.ok ? ' - the cue this mode does reach on ' + game + ' (' + r.via + ') is a ' +
          'different one, and having it on the page does not discharge this sentence' : '') + '. The controls drawn are ' +
          JSON.stringify(names) + '. Say which control to use, or put one on this view that builds the cue.');
      }
    });
  }
}

// A positive control on the guard itself. A stand-in device that silently recorded nothing would make every
// mode above look cue-less and let the "or the page says how" branch carry the whole file; this fails first
// and says so. It also prints the route found for every mode/game under CUE_REACHABLE_VERBOSE=1, which is the
// quickest way to see what a runner is actually being offered.
test('the stand-in device really counts tones, so a green run above means cues were played', () => {
  const rows = [];
  for (const id of A.order) for (const game of A.modes[id].games) {
    const r = walkOf(id, game);
    rows.push({ id, game, cue: r.ok, via: r.via || (NO_CUE_BY_DESIGN[id] ? 'no cue by design' : (statedGap(r.html, game).length ? 'no model for this game, and the page says so' : 'no cue: ' + JSON.stringify((actionable(r.html)[0] || {}).sentence || ''))) });
  }
  if (process.env.CUE_REACHABLE_VERBOSE) rows.forEach((x) => console.log('   ' + x.id.padEnd(13) + x.game.padEnd(10) + (x.cue ? 'CUE  ' : '---  ') + x.via));
  assert.ok(rows.filter((x) => x.cue).length > 0, 'at least one mode/game schedules real tones through the shared cue engine; if none do, ' +
    'the stand-in audio device is broken and every assertion above passed for the wrong reason');
});
