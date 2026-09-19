(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BufferDecode = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // Reference decoder for gen1-buffer.json (Gen 1 TID buffer guide).  Same algorithm as
  // tools/gen1-buffer-guide/make_json.py (decode_seq / unpack / compose_timeline); the JSON's
  // "encoding" block documents the format.  Every malformed input throws.
  var SINGLE = {
    n: "nopal", p: "pal", a: "nopal(ab)", h: "pal(hold)", q: "pal(ab)",
    g: "gfskip", w: "gfwait", G: "gfreset", i: "introwait",
    T: "title", Q: "title(reset)", U: "title(usb)",
    c: "csreset", o: "opt(backout)", O: "opt(reset)", b: "backout", N: "ngreset",
    e: "newgame", k: "oakreset"
  };
  var NUMBERED = {
    R: function (hw, n) { return hw + n + "(reset)"; },
    t: function (hw, n) { return "title" + n; },
    s: function (hw, n) { return "title" + n + "(scroll)"; },
    r: function (hw, n) { return "title" + n + "(reset)"; },
    x: function (hw, n) { return "title" + n + "(scrollreset)"; },
    u: function (hw, n) { return "title" + n + "(usb)"; },
    v: function (hw, n) { return "title" + n + "(scrollusb)"; }
  };
  var PAL = { nopal: 1, pal: 1, "nopal(ab)": 1, "pal(hold)": 1, "pal(ab)": 1 };
  var B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

  function unb36(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var d = B36.indexOf(s.charAt(i));
      if (d < 0) throw new Error("bad base36 char " + JSON.stringify(s.charAt(i)));
      n = n * 36 + d;
    }
    return n;
  }

  function hopWord(game) { return game === "yellow" ? "intro" : "hop"; }

  function decodeSeq(code, game) {
    var toks = [], i = 0, hw = hopWord(game);
    while (i < code.length) {
      var c = code.charAt(i);
      if (c >= "0" && c <= "6") { toks.push(hw + c); i += 1; }
      else if (Object.prototype.hasOwnProperty.call(NUMBERED, c)) {
        var d = code.charAt(i + 1);
        if (i + 1 >= code.length || !(d >= "0" && d <= "9")) throw new Error("corrupt entry: " + c + " needs a digit at " + i + " in " + JSON.stringify(code));
        toks.push(NUMBERED[c](hw, parseInt(d, 10))); i += 2;
      }
      else if (Object.prototype.hasOwnProperty.call(SINGLE, c)) { toks.push(SINGLE[c]); i += 1; }
      else throw new Error("corrupt entry: unknown code " + JSON.stringify(c) + " at " + i + " in " + JSON.stringify(code));
    }
    toks.push("newgame");
    return toks.join("_");
  }

  function titleActs(seq) {
    var out = [], t = seq.split("_");
    for (var i = 0; i < t.length; i++) if (t[i].indexOf("title") === 0) out.push(t[i]);
    return out;
  }

  function actionsOf(seq) {
    var out = [], t = seq.split("_");
    for (var i = 0; i < t.length; i++) {
      var tok = t[i];
      if (PAL[tok]) out.push([tok, "boot"]);
      else if (tok === "opt(backout)") { out.push([tok, "opt"]); out.push([tok, "opt-exit"]); }
      else if (tok === "opt(reset)") { out.push([tok, "opt"]); out.push([tok, "opt-reset"]); }
      else out.push([tok, tok]);
    }
    return out;
  }

  // packed table -> [{tid, entries: [{seq, s (centiseconds), v, win: [[reg, exit], ...] | null}]}]
  function unpack(packed, game, titleModel) {
    var groups = packed.seqs.split(";"), tids = [], i;
    if (packed.ids === null || packed.ids === undefined) {
      if (groups.length !== 65536) throw new Error("corrupt pack: " + groups.length + " groups for a complete table");
      for (i = 0; i < 65536; i++) tids.push(i);
    } else {
      var parts = packed.ids.split(","), prev = -1;
      for (i = 0; i < parts.length; i++) { prev = prev + unb36(parts[i]) + 1; tids.push(prev); }
      if (tids.length !== groups.length) throw new Error("corrupt pack: " + tids.length + " ids for " + groups.length + " groups");
    }
    var S = packed.s, V = packed.v, W = packed.w, si = 0, vi = 0, wi = 0, out = [];
    for (i = 0; i < groups.length; i++) {
      var codes = groups[i].split("|"), ents = [];
      for (var j = 0; j < codes.length; j++) {
        var seq = decodeSeq(codes[j], game);
        if (si + 3 > S.length || vi + 1 > V.length) throw new Error("corrupt pack: s/v exhausted");
        var cs = unb36(S.substr(si, 3)); si += 3;
        var v = V.charAt(vi); vi += 1;
        if (v !== "b" && v !== "h" && v !== "l") throw new Error("corrupt pack: bad v " + JSON.stringify(v));
        var win = null;
        if (v !== "l") {
          win = [];
          var acts = titleActs(seq);
          for (var k = 0; k < acts.length; k++) {
            if (wi + 4 > W.length) throw new Error("corrupt pack: w exhausted");
            var tm = titleModel[acts[k]];
            if (!tm) throw new Error("no title model for " + acts[k]);
            win.push([tm.reg[0] + unb36(W.substr(wi, 2)), tm.exit[0] + unb36(W.substr(wi + 2, 2))]); wi += 4;
          }
        }
        ents.push({ seq: seq, s: cs, v: v, win: win });
      }
      out.push({ tid: tids[i], entries: ents });
    }
    if (si !== S.length || vi !== V.length || wi !== W.length) throw new Error("corrupt pack: trailing s/v/w data");
    return out;
  }

  // one TID without decoding the whole table (complete tables only need the group index)
  function lookup(doc, game, plat, tid) {
    var gp = doc.games[game] && doc.games[game][plat];
    if (!gp) return null;
    var packed = gp.packed, tm = doc.windows.games[game][plat].scenes.title;
    var groups = packed.seqs.split(";"), idx = -1, i;
    if (packed.ids === null || packed.ids === undefined) idx = tid;
    else {
      var parts = packed.ids.split(","), prev = -1;
      for (i = 0; i < parts.length; i++) { prev = prev + unb36(parts[i]) + 1; if (prev === tid) { idx = i; break; } if (prev > tid) break; }
    }
    if (idx < 0 || idx >= groups.length) return null;
    // entry offsets: count entries, title tokens and list rows before this group
    var si = 0, wi = 0;
    for (i = 0; i < idx; i++) {
      var codes = groups[i].split("|");
      for (var j = 0; j < codes.length; j++) {
        var v = packed.v.charAt(si);
        if (v !== "l") wi += 4 * titleActs(decodeSeq(codes[j], game)).length;
        si += 1;
      }
    }
    var ents = [], cs = groups[idx].split("|");
    for (var k = 0; k < cs.length; k++) {
      var seq = decodeSeq(cs[k], game), vv = packed.v.charAt(si), win = null;
      if (vv !== "l") {
        win = []; var acts = titleActs(seq);
        for (var a = 0; a < acts.length; a++) { var m = tm[acts[a]]; win.push([m.reg[0] + unb36(packed.w.substr(wi, 2)), m.exit[0] + unb36(packed.w.substr(wi + 2, 2))]); wi += 4; }
      }
      ents.push({ seq: seq, s: unb36(packed.s.substr(si * 3, 3)), v: vv, win: win });
      si += 1;
    }
    return { tid: tid, entries: ents };
  }

  // per-action windows in harness steps from the windows model + the entry's title values
  function composeTimeline(wmodel, gameStart, seq, win) {
    var scene = "gamefreak", sstart = gameStart + wmodel.gamefreak_start, steps = [], ti = 0, newgame = null, roll = null;
    var acts = actionsOf(seq);
    for (var i = 0; i < acts.length; i++) {
      var tok = acts[i][0], act = acts[i][1], e, st;
      if (act === "boot") { steps.push({ token: tok, action: act, scene: "boot", scene_start: 0 }); continue; }
      if (scene === "title") {
        e = wmodel.scenes.title[act];
        if (!e) throw new Error("no title constant for " + act);
        if (!win || ti >= win.length) throw new Error("entry has no measured title windows (list-only row)");
        var reg = win[ti][0], ex = win[ti][1]; ti += 1;
        steps.push({ token: tok, action: act, scene: scene, scene_start: sstart, gap: sstart + e.gap[0], reg: sstart + reg, next_scene: e.next_scene, next_start: sstart + reg + ex });
        sstart += reg + ex; scene = e.next_scene; continue;
      }
      e = wmodel.scenes[scene] && wmodel.scenes[scene][act];
      if (!e) throw new Error("no constant for " + scene + "/" + act);
      st = { token: tok, action: act, scene: scene, scene_start: sstart, next_scene: e.next[0], next_start: sstart + e.next[1] };
      if (e.reg !== undefined) { st.gap = sstart + e.gap; st.reg = sstart + e.reg; }
      else st.run = [sstart + e.run[0], sstart + e.run[1]];
      if (act === "newgame") { newgame = sstart + e.reg; roll = newgame + wmodel.roll_delay; st.roll = roll; }
      steps.push(st); sstart += e.next[1]; scene = e.next[0];
    }
    return { steps: steps, newgame: newgame, roll: roll };
  }

  return { SINGLE: SINGLE, unb36: unb36, decodeSeq: decodeSeq, titleActs: titleActs, actionsOf: actionsOf, unpack: unpack, lookup: lookup, composeTimeline: composeTimeline };
});
