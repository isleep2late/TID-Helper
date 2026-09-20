(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TidSources = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // Published Trainer ID manipulations, looked up by game and Trainer ID, so every surface that
  // serves a Trainer ID route can cite the original source beside it (data/tid-sources.json).
  // Three outcomes, in the data's own words: "documented" (a published video or page for that
  // exact Trainer ID: the original source), "community" (the ID comes from a published community
  // list but no video or page for it is on record here) and "derived" (nothing published is on
  // record; the route is this project's own). Nothing here decides which routes are served; it
  // only attributes them.
  function hex4(v) { var s = (v & 0xFFFF).toString(16).toUpperCase(); while (s.length < 4) s = "0" + s; return s; }
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  function check(data) {
    if (!isObj(data)) throw new Error("tid-sources: data is not an object");
    if (!isObj(data.labels)) throw new Error("tid-sources: no labels block");
    ["documented", "community", "derived"].forEach(function (k) {
      if (!isObj(data.labels[k]) || typeof data.labels[k].label !== "string" || typeof data.labels[k].text !== "string") throw new Error("tid-sources: labels." + k + " needs label and text");
    });
    if (!isObj(data.games)) throw new Error("tid-sources: no games block");
    if (!Array.isArray(data.entries)) throw new Error("tid-sources: entries is not a list");
    data.entries.forEach(function (e, i) {
      if (!isObj(e)) throw new Error("tid-sources: entry " + i + " is not an object");
      if (!Array.isArray(e.games) || !e.games.length) throw new Error("tid-sources: entry " + i + " names no games");
      e.games.forEach(function (g) { if (!data.games[g]) throw new Error("tid-sources: entry " + i + " names unknown game " + g); });
      if (e.tid !== null && !/^[0-9A-F]{4}$/.test(String(e.tid))) throw new Error("tid-sources: entry " + i + " tid must be 4 upper-case hex digits or null");
      ["title", "author", "url", "kind"].forEach(function (k) { if (typeof e[k] !== "string" || !e[k]) throw new Error("tid-sources: entry " + i + " lacks " + k); });
      if (!/^https:\/\//.test(e.url)) throw new Error("tid-sources: entry " + i + " url is not https");
      if (["video", "wiki", "guide", "forum", "list", "route"].indexOf(e.kind) < 0) throw new Error("tid-sources: entry " + i + " has kind " + e.kind);
    });
    // beyond: the generations this app does NOT cover, and where to go instead. It is data rather than prose
    // in a page so that a status cannot be softened in one place and left stale in another - "not possible"
    // is a claim about the game and has to be checkable.
    if (data.beyond !== undefined) {
      var b = data.beyond;
      if (!isObj(b)) throw new Error("tid-sources: beyond is not an object");
      ["why", "also", "checked"].forEach(function (k) { if (typeof b[k] !== "string" || !b[k]) throw new Error("tid-sources: beyond lacks " + k); });
      if (!Array.isArray(b.generations) || !b.generations.length) throw new Error("tid-sources: beyond.generations is empty");
      var OK = ["possible-with-homebrew", "not-possible", "not-established-here"];
      b.generations.forEach(function (g, i) {
        ["gen", "games", "console", "status", "what"].forEach(function (k) { if (typeof g[k] !== "string" || !g[k]) throw new Error("tid-sources: beyond.generations[" + i + "] lacks " + k); });
        if (OK.indexOf(g.status) < 0) throw new Error("tid-sources: beyond.generations[" + i + "] status " + g.status + " is not one of " + OK.join(", "));
        if (!Array.isArray(g.links) || !g.links.length) throw new Error("tid-sources: beyond.generations[" + i + "] offers no link, which is the whole point of the block");
        g.links.forEach(function (l) { if (!isObj(l) || typeof l.title !== "string" || !l.title || !/^https:\/\//.test(String(l.url))) throw new Error("tid-sources: beyond.generations[" + i + "] has a bad link"); });
      });
      if (!Array.isArray(b.general) || !b.general.length) throw new Error("tid-sources: beyond.general must offer somewhere to start");
      b.general.forEach(function (l) { if (!isObj(l) || typeof l.title !== "string" || !l.title || !/^https:\/\//.test(String(l.url))) throw new Error("tid-sources: beyond.general has a bad link"); });
    }
    // tools: the community programs a page's own cue or timer stands in for (EonTimer, FlowTimer), credited by id
    if (data.tools !== undefined) {
      if (!Array.isArray(data.tools)) throw new Error("tid-sources: tools is not a list");
      var ids = {};
      data.tools.forEach(function (t, i) {
        if (!isObj(t)) throw new Error("tid-sources: tool " + i + " is not an object");
        ["id", "name", "author", "url", "what"].forEach(function (k) { if (typeof t[k] !== "string" || !t[k]) throw new Error("tid-sources: tool " + i + " lacks " + k); });
        if (!/^[a-z0-9-]+$/.test(t.id)) throw new Error("tid-sources: tool id " + t.id + " is not a slug");
        if (ids[t.id]) throw new Error("tid-sources: duplicate tool id " + t.id);
        ids[t.id] = true;
        if (!/^https:\/\//.test(t.url)) throw new Error("tid-sources: tool " + t.id + " url is not https");
        if (t.links !== undefined) {
          if (!Array.isArray(t.links)) throw new Error("tid-sources: tool " + t.id + " links is not a list");
          t.links.forEach(function (l) { if (!isObj(l) || typeof l.title !== "string" || !/^https:\/\//.test(String(l.url))) throw new Error("tid-sources: tool " + t.id + " has a bad link"); });
        }
      });
    }
  }

  // index: game -> hex4 -> [entries]; game -> [general entries] (tid null)
  function build(data) {
    check(data);
    var byTid = {}, general = {};
    data.entries.forEach(function (e) {
      e.games.forEach(function (g) {
        if (e.tid === null) { (general[g] = general[g] || []).push(e); return; }
        byTid[g] = byTid[g] || {};
        (byTid[g][e.tid] = byTid[g][e.tid] || []).push(e);
      });
    });
    return { data: data, byTid: byTid, general: general };
  }

  var IX = null;
  function bind(data) { IX = build(data); return IX; }
  function need() { if (!IX) throw new Error("tid-sources: no data bound"); return IX; }
  function forTid(game, tid) {
    var ix = need(), m = ix.byTid[game];
    return m && m[hex4(tid)] ? m[hex4(tid)].slice() : [];
  }
  function general(game) { var ix = need(); return (ix.general[game] || []).slice(); }
  function gameName(game) { return need().data.games[game] || game; }
  function tools() { var t = need().data.tools; return Array.isArray(t) ? t.slice() : []; }
  function tool(id) { var m = tools().filter(function (t) { return t.id === id; }); return m.length ? m[0] : null; }

  // provenance: "community" when the route itself is a published community row (the Gen 1 buffer
  // lists' b / l rows), otherwise "derived"; the documented outcome overrides both when a source
  // for this exact Trainer ID exists. Returns {kind, label, text, entries}.
  function describe(game, tid, provenance) {
    var ix = need(), entries = forTid(game, tid);
    var kind = entries.length ? "documented" : provenance === "community" ? "community" : "derived";
    var L = ix.data.labels[kind];
    return { kind: kind, label: L.label, text: L.text, entries: entries };
  }
  // one line per source, plain text (the pages escape it themselves)
  function cite(e) {
    var s = e.title + " - " + e.author;
    if (e.date) s += ", " + String(e.date).slice(0, 4);
    if (e.kind !== "video") s += " (" + e.kind + ")";
    return s;
  }
  function beyond() { var ix = need(); return ix.data.beyond || null; }
  return { bind: bind, build: build, check: check, beyond: beyond, forTid: forTid, general: general, gameName: gameName, tools: tools, tool: tool, describe: describe, cite: cite, hex4: hex4 };
});
