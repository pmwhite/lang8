// Smooth Bible on the web: the skin (SKINS.md). Core runs in WebAssembly
// (programs/bible/web/main.l8, the app and a host for the browser), and
// this draws what it says, the web's way: the reader as the page itself,
// core's screens in a panel beside it (over it, on a narrow window), the
// selection's toolbar, the browser's Back. It decides how things look and
// move; what is there and what happens are core's. They talk in lines
// (UTF-8, `\n`-ended, fields split by tabs), as Android's skin does.
import { instantiate, runResumable, pausing } from "../../../../web/l8-runtime.js";

const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "";
const DATA = "/read/data/" + meta("sb-data");
const ICONS = "/read/" + meta("sb-icons");
const WASM = "/read/" + meta("sb-wasm");
const enc = new TextEncoder();
const dec = new TextDecoder();
const clock = () => Math.round(performance.now());
const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS(ns, "use");
  u.setAttribute("href", `${ICONS}#${name}`);
  s.appendChild(u);
  return s;
}

// ---- the wire ----
// A line: its fields split by tabs (each unescaped) and the words of its
// first field.
const unescape = (s) => (s.indexOf("\\") < 0 ? s : s.replace(/\\(.)/g, (_, c) => (c === "t" ? "\t" : c === "n" ? "\n" : c)));
const escape = (s) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t");

class Wire {
  constructor(line) {
    this.fields = line.split("\t").map(unescape);
    this.words = this.fields[0].split(" ");
  }
  word(i) {
    return this.words[i] ?? "";
  }
  num(i) {
    const n = parseInt(this.words[i], 10);
    return Number.isNaN(n) ? 0 : n;
  }
  field(i) {
    return this.fields[i] ?? "";
  }
  fnum(i) {
    const n = Number(this.fields[i]);
    return Number.isFinite(n) ? n : 0;
  }
}

// ---- the bridge to core ----
let inbox = "";
let wakeUp = null;
const files = new Map();

function send(line) {
  inbox += line + "\n";
  if (wakeUp) {
    const w = wakeUp;
    wakeUp = null;
    w();
  }
}

// (A version and the plans first; the language data and the Manual at low
// priority, after the reader: host ids from 12.)
async function fetchData(id, name) {
  try {
    const r = await fetch(`${DATA}/${name}.gz`, { priority: id >= 12 ? "low" : "high" });
    if (!r.ok) throw new Error(r.status);
    const body = r.body.pipeThrough(new DecompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    files.set(id, bytes);
    send(`got ${id} ${bytes.length}`);
  } catch (e) {
    console.warn("smooth bible: no", name, e);
    send(`got ${id} -1`);
  }
}

const imports = {
  bw_wait: pausing(),
  bw_take(buf, cap) {
    let total = 0;
    const parts = [];
    while (inbox.length) {
      const e = inbox.indexOf("\n");
      const line = enc.encode(inbox.slice(0, e + 1));
      if (total + line.length > Number(cap)) break;
      parts.push(line);
      total += line.length;
      inbox = inbox.slice(e + 1);
    }
    const b = this.bytes();
    let p = Number(buf);
    for (const l of parts) {
      b.set(l, p);
      p += l.length;
    }
    return BigInt(total);
  },
  bw_say(b, start, n) {
    const p = Number(b) + Number(start);
    said(dec.decode(this.bytes().slice(p, p + Number(n))));
    return 0n;
  },
  bw_ask(id, name) {
    fetchData(Number(id), this.string(name));
    return 0n;
  },
  bw_file(id, out) {
    const data = files.get(Number(id)) || new Uint8Array(0);
    files.delete(Number(id));
    const p = Number(out);
    const cap = Number(this.view().getBigInt64(p - 8, true));
    this.bytes().set(data.subarray(0, Math.min(cap, data.length)), p);
    return BigInt(data.length);
  },
  bw_store_get(b, start, end, out) {
    const key = "sb." + dec.decode(this.bytes().slice(Number(b) + Number(start), Number(b) + Number(end)));
    const v = localStorage.getItem(key);
    if (v == null) return -1n;
    const data = enc.encode(v);
    const p = Number(out);
    const cap = Number(this.view().getBigInt64(p - 8, true));
    this.bytes().set(data.subarray(0, Math.min(cap, data.length)), p);
    return BigInt(data.length);
  },
  bw_store_set(b, start, end, v, n) {
    const key = "sb." + dec.decode(this.bytes().slice(Number(b) + Number(start), Number(b) + Number(end)));
    try {
      localStorage.setItem(key, dec.decode(this.bytes().slice(Number(v), Number(v) + Number(n))));
    } catch (e) {
      console.warn("smooth bible: not kept", key, e);
    }
    return 0n;
  },
  bw_store_remove(b, start, end) {
    localStorage.removeItem("sb." + dec.decode(this.bytes().slice(Number(b) + Number(start), Number(b) + Number(end))));
    return 0n;
  },
};

// ---- the look (core's look line) ----
const look = { size: 1, spacing: 1.32, margin: 28, dark: false, red: false, accent: "#9C3A2C", rule: "#1E1C19", gloss: 0.32 };

function readLook(w) {
  look.size = w.num(1) / 1000;
  look.spacing = w.num(2) / 1000;
  look.margin = w.num(3);
  look.dark = w.num(4) !== 0;
  look.red = w.num(5) !== 0;
  const c = (i) => "#" + w.word(i);
  const s = document.documentElement.style;
  s.setProperty("--bg", c(6));
  s.setProperty("--ink", c(7));
  s.setProperty("--heading", c(8));
  s.setProperty("--faint", c(9));
  s.setProperty("--accent", c(10));
  s.setProperty("--rule", c(11));
  s.setProperty("--gloss", hexAlpha(w.word(11), (w.num(12) || 320) / 1000));
  s.setProperty("--size", look.size);
  s.setProperty("--lh", look.spacing);
  s.setProperty("--margin", look.margin + "px");
  s.background = c(6);
  look.accent = c(10);
  document.documentElement.classList.toggle("dark", look.dark);
  document.documentElement.classList.toggle("red", look.red);
  $('meta[name="theme-color"]').content = c(6);
}

function hexAlpha(hex, a) {
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---- words by runs (core's END:STYLE pairs, UTF-16 places) ----
// The reader's styles (below 100: text.l8's STYLE_) and core's (ui.l8's
// RUN_), each a class; a Practice word's look (RUN_PRACTICE + its bits) its
// own classes.
const RUN_PRACTICE = 200;

function runClass(st) {
  if (st >= RUN_PRACTICE && st < RUN_PRACTICE + 256) {
    const l = st - RUN_PRACTICE;
    let c = `px px-c${l & 3} px-u${(l >> 2) & 7}`;
    if (l & 32) c += " px-heard";
    if (l & 192) c += " px-orig";
    return c;
  }
  return `s${st}`;
}

function parseRuns(s) {
  s = s.trim();
  if (!s) return [];
  const out = [];
  for (const part of s.split(" ")) {
    const k = part.indexOf(":");
    if (k < 0) return [];
    out.push([+part.slice(0, k), +part.slice(k + 1)]);
  }
  return out;
}

// Words into node: by their runs, with links (B, E, ACTION, ARG) each a
// button-like span that calls onLink.
function rich(node, text, runs, links = [], onLink = null) {
  if (!runs.length && !links.length) {
    node.append(text);
    return node;
  }
  const cuts = new Set([0, text.length]);
  for (const [e] of runs) cuts.add(Math.min(e, text.length));
  for (const l of links) {
    cuts.add(Math.min(l[0], text.length));
    cuts.add(Math.min(l[1], text.length));
  }
  const at = [...cuts].sort((a, b) => a - b);
  let r = 0;
  let from = 0;
  for (let i = 0; i + 1 < at.length; i++) {
    const a = at[i];
    const b = at[i + 1];
    if (b <= a) continue;
    while (r < runs.length && runs[r][0] <= a) {
      from = runs[r][0];
      r++;
    }
    const st = r < runs.length ? runs[r][1] : -1;
    const link = links.find((l) => l[0] <= a && a < l[1]);
    const s = el(link ? "a" : "span", st >= 0 ? runClass(st) : "", text.slice(a, b));
    if (link && onLink) {
      s.href = "#";
      s.classList.add("ln");
      s.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onLink(link);
      });
    }
    node.appendChild(s);
  }
  void from;
  return node;
}

// ---- screens as data (core's screen lines) ----
const split = (s) => (s ? s.split("|") : []);

function actionsOf(s) {
  if (!s) return [];
  return s.split("|").map((a) => {
    const k = a.indexOf(":");
    return k < 0 ? null : { action: +a.slice(0, k), title: a.slice(k + 1), icon: "" };
  }).filter(Boolean);
}

function rowOf(w) {
  const r = {
    kind: w.field(1), action: w.fnum(2), arg: w.field(3), title: w.field(4), detail: w.field(5),
    icon: w.field(6), acc: w.field(7), flags: w.field(8), value: w.fnum(9), options: w.field(10),
    lo: w.fnum(11), hi: w.fnum(12), label: w.field(13), trailing: w.field(14), del: w.fnum(15),
    custom: w.fnum(16), hint: w.field(17), marks: w.field(18).trim().split(" ").filter(Boolean).map(Number),
    lines: w.fnum(19), circle: w.fnum(20), circleAction: w.fnum(21), suffix: w.field(22),
    iconColor: w.field(23), note: w.field(24), info: w.fnum(25), actions: actionsOf(w.field(26)),
    runs: parseRuns(w.field(27)), truns: parseRuns(w.field(28)), titleLines: w.fnum(29),
    fieldKind: w.fnum(30), lead: w.field(31), leadStyle: w.fnum(32), side: w.field(33),
    sruns: parseRuns(w.field(34)), sideNote: w.field(35), links: [], cells: [],
  };
  split(w.field(36)).forEach((ic, i) => {
    if (r.actions[i]) r.actions[i].icon = ic;
  });
  for (const p of split(w.field(37))) {
    const q = p.split(":").map(Number);
    if (q.length >= 4 && q.every(Number.isFinite)) r.links.push(q);
  }
  r.flag = (c) => r.flags.includes(c);
  return r;
}

function cellOf(w) {
  return {
    action: w.fnum(1), arg: w.field(2), script: w.fnum(3), text: w.field(4), sub: w.field(5),
    count: w.field(6), label: w.field(7), tr: w.field(8), flags: w.fnum(9), actions: actionsOf(w.field(10)),
  };
}

const screens = new Map();
let building = null;
let section = null;
let chapter = null;

// core/skin.l8's CUSTOM_HIT (a verse found) and CUSTOM_SWATCHES.
const CUSTOM_HIT = 5;
const CUSTOM_SWATCHES = 6;

function screenLine(w) {
  const word = w.word(0);
  const s = building;
  switch (word) {
    case "section":
      section = { header: w.field(1), footer: w.field(2), button: w.field(3), buttonAction: w.fnum(4), suffix: w.field(5), credit: w.fnum(6), columns: split(w.field(7)), rows: [] };
      s.sections.push(section);
      break;
    case "row":
      if (section) section.rows.push(rowOf(w));
      break;
    case "cell":
      if (section && section.rows.length) section.rows[section.rows.length - 1].cells.push(cellOf(w));
      break;
    case "empty":
      Object.assign(s, { emptySymbol: w.field(1), emptyTitle: w.field(2), emptyLine: w.field(3) });
      break;
    case "focus":
      s.focus = w.num(1);
      s.focusMode = w.num(2);
      break;
    case "intro":
      Object.assign(s, { intro: w.field(1), introRuns: parseRuns(w.field(2)), introQuote: w.fnum(3) === 1 });
      break;
    case "left":
      Object.assign(s, { leftAction: w.fnum(1), left: w.field(2) });
      break;
    case "hero":
      Object.assign(s, { hero: w.field(1), heroScript: w.fnum(2), heroSub: w.field(3), heroLine: w.field(4), heroRuns: parseRuns(w.field(5)) });
      break;
    case "tool":
      s.tools.push({ action: w.fnum(1), arg: w.field(2), title: w.field(3), icon: w.field(4), label: w.field(5), style: w.fnum(6), place: w.fnum(7), menu: w.field(8) });
      break;
    case "confirm":
      Object.assign(s, { confirmAction: w.fnum(1), confirm: w.field(2), confirmOff: w.fnum(3) === 1 });
      break;
    case "segments":
      Object.assign(s, { segmentsAction: w.fnum(1), segment: w.fnum(2), segments: split(w.field(3)) });
      break;
    case "filter":
      Object.assign(s, { filterAction: w.fnum(1), filter: w.fnum(2), filterColors: split(w.field(3)), filterLabels: split(w.field(4)) });
      break;
    case "sort":
      Object.assign(s, { sortAction: w.fnum(1), sort: w.fnum(2), sorts: split(w.field(3)) });
      break;
    case "field":
      Object.assign(s, { searchText: w.field(1), wait: w.fnum(2), go: w.field(3).includes("g"), focusField: w.field(3).includes("f") });
      break;
    case "scopes":
      Object.assign(s, { scope: w.fnum(1), scopes: split(w.field(2)), scopeLabels: split(w.field(3)) });
      break;
    case "plain":
      s.plain = true;
      break;
    case "page":
      s.page = true;
      break;
    case "grid":
      s.grid = true;
      break;
    case "button":
      s.button = w.field(1);
      break;
    case "command":
      s.commands.push({ action: w.fnum(1), arg: w.fnum(2), title: w.field(3), destructive: w.field(4).includes("x") });
      break;
    case "end":
      screens.set(s.id, s);
      building = null;
      section = null;
      screenBuilt(s);
      break;
    default:
      break;
  }
}

function newScreen(w) {
  return {
    id: w.num(1), kind: w.num(2), arg: w.num(3), title: w.field(1), search: w.field(2), sections: [], tools: [],
    commands: [], focus: -1, focusMode: 0, segments: [], filterColors: [], sorts: [], scopes: [], searchText: "",
    intro: "", hero: "", left: "", confirm: "", button: "", emptyTitle: "", emptyLine: "",
  };
}

// ---- what core said ----
function said(text) {
  let p = 0;
  while (p < text.length) {
    let e = text.indexOf("\n", p);
    if (e < 0) e = text.length;
    if (e > p) line(new Wire(text.slice(p, e)));
    p = e + 1;
  }
}

let menuWanted = false;
let started = false;

function line(w) {
  const word = w.word(0);
  if (building) {
    screenLine(w);
    return;
  }
  if (chapter) {
    if (word === "end") {
      reader.chapter(chapter.c, chapter.text, chapter.lines);
      chapter = null;
    } else chapter.lines.push(w);
    return;
  }
  switch (word) {
    case "ready":
      begin();
      break;
    case "screen":
      building = newScreen(w);
      break;
    case "chapter":
      chapter = { c: w.num(1), text: w.field(1), lines: [] };
      break;
    case "present":
      panel.present(w.num(1));
      break;
    case "push":
    case "present_over":
      panel.push(w.num(1));
      break;
    case "panel":
      panel.present(w.num(1));
      break;
    case "update":
    case "refill":
      panel.update(w.num(1));
      break;
    case "pop":
    case "close":
      panel.back(false);
      break;
    case "pop_to":
      panel.popTo(w.num(1));
      break;
    case "dismiss":
      panel.dismiss();
      break;
    case "retext":
      panel.retext(w.num(1));
      break;
    case "blur":
      document.activeElement?.blur?.();
      break;
    case "url":
      window.open(w.field(1), "_blank", "noopener");
      break;
    case "refresh":
      send("refresh");
      break;
    case "look":
      readLook(w);
      break;
    case "reader":
      reader.setCount(w.num(1));
      break;
    case "jump":
      reader.jump(w.num(1), w.num(2), 0);
      break;
    case "goto":
      send("jumped 0");
      panel.dismiss();
      reader.jump(w.num(1), w.num(2), 0);
      break;
    case "place":
      panel.dismiss();
      reader.jump(w.num(1), Math.floor(w.num(2) / 1000), w.num(2) % 1000);
      break;
    case "relayout":
      reader.relayout();
      break;
    case "page":
      reader.page(w.num(1) === 1 ? 1 : -1);
      break;
    case "follow":
      reader.follow(w.num(1), w.num(2));
      break;
    case "wake":
      reader.wake(w.num(1));
      break;
    case "title":
      bar.title(w.field(1));
      break;
    case "version":
      bar.version(w.field(1));
      break;
    case "selection":
      reader.selection(w.field(1));
      break;
    case "tray":
      tray.show(screens.get(0));
      break;
    case "tray_away":
      tray.hide();
      break;
    case "clear_selection":
      reader.selection("-1");
      tray.hide();
      break;
    case "study_verse":
      tray.hide();
      send(`versestudy ${w.num(1)} ${w.num(2)}`);
      break;
    case "highlighted":
    case "bookmarked":
    case "marked_verse":
      reader.reaskSelected();
      if (word === "bookmarked") toast(w.num(1) === 1 ? "Bookmarked" : "Bookmark Removed");
      break;
    case "copy":
      navigator.clipboard?.writeText(w.field(1)).then(() => toast("Copied"), () => {});
      break;
    case "share":
      if (navigator.share) navigator.share({ text: w.field(1) }).catch(() => {});
      else navigator.clipboard?.writeText(w.field(1)).then(() => toast("Copied"), () => {});
      break;
    case "toast":
      toast(w.field(1));
      break;
    case "memorized":
      toast("Added to Memory");
      break;
    case "back":
      capsule.show(w.field(1));
      break;
    case "say":
      voice.say(w.num(1), w.num(2), w.field(1));
      break;
    case "player":
      player.show(w.field(1), w.field(2));
      break;
    case "listen_stop":
      voice.stop();
      player.hide();
      break;
    case "awake":
      awake(w.num(1));
      break;
    default:
      break;
  }
}

// What core built: the title's menu, if asked for.
function screenBuilt(s) {
  if (s.id === 0 && menuWanted) {
    menuWanted = false;
    const items = [];
    for (const sec of s.sections) for (const r of sec.rows) if (r.action) items.push({ title: r.detail ? `${r.title}  ${r.detail}` : r.title, run: () => send(`menuact ${r.action} ${r.arg}`) });
    popup(bar.titleButton, items);
  }
}

// ---- the Bible's books (their places: chapter numbers into addresses) ----
const BOOKS = "genesis:50,exodus:40,leviticus:27,numbers:36,deuteronomy:34,joshua:24,judges:21,ruth:4,1-samuel:31,2-samuel:24,1-kings:22,2-kings:25,1-chronicles:29,2-chronicles:36,ezra:10,nehemiah:13,esther:10,job:42,psalms:150,proverbs:31,ecclesiastes:12,song-of-solomon:8,isaiah:66,jeremiah:52,lamentations:5,ezekiel:48,daniel:12,hosea:14,joel:3,amos:9,obadiah:1,jonah:4,micah:7,nahum:3,habakkuk:3,zephaniah:3,haggai:2,zechariah:14,malachi:4,matthew:28,mark:16,luke:24,john:21,acts:28,romans:16,1-corinthians:16,2-corinthians:13,galatians:6,ephesians:6,philippians:4,colossians:4,1-thessalonians:5,2-thessalonians:3,1-timothy:6,2-timothy:4,titus:3,philemon:1,hebrews:13,james:5,1-peter:5,2-peter:3,1-john:5,2-john:1,3-john:1,jude:1,revelation:22"
  .split(",").map((s) => s.split(":")).map(([slug, n]) => ({ slug, n: +n }));

function chapterAddress(c) {
  let k = c;
  for (const b of BOOKS) {
    if (k < b.n) return `${b.slug}/${k + 1}`;
    k -= b.n;
  }
  return null;
}

function chapterOfAddress(path) {
  const m = /^\/read\/(?:[a-z]+\/)?([a-z0-9-]+)(?:\/(\d+))?\/?$/.exec(path);
  if (!m) return -1;
  let c = 0;
  for (const b of BOOKS) {
    if (b.slug === m[1]) return c + Math.max(0, Math.min(b.n, +(m[2] || 1)) - 1);
    c += b.n;
  }
  return -1;
}

// ---- the bar ----
const bar = {
  titleButton: $(".bar .title"),
  versionWord: "",
  title(t) {
    $(".t", this.titleButton).textContent = t;
    this.titleButton.setAttribute("aria-label", `${t}, Go To`);
    document.title = `${t} · Smooth Bible`;
  },
  version(v) {
    this.versionWord = v;
    const b = $(".bar .version");
    b.textContent = v;
    b.setAttribute("aria-label", `Version: ${v}`);
    if (reader.said.c >= 0) address(reader.said.c);
  },
};

bar.titleButton.addEventListener("click", () => send("tap goto"));
bar.titleButton.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  menuWanted = true;
  send("titlemenu");
});
$(".bar .library").addEventListener("click", () => send("tap library"));
$(".bar .search").addEventListener("click", () => send("tap search"));
$(".bar .version").addEventListener("click", () => send("tap versions"));
$(".bar .aa").addEventListener("click", () => send("tap settings"));

// ---- the reader ----
// Every chapter in order, those near the place on the page (more added as
// it is scrolled to either end), each asked of core when it is first
// wanted; the place at the top told back as it changes, and the reader's
// rests, as core counts reading.
const barHeight = () => $(".bar").getBoundingClientRect().bottom;
const emPx = () => parseFloat(getComputedStyle($("#reader")).fontSize) || 19;

const reader = {
  main: $("#reader"),
  count: 0,
  lo: 0,
  hi: -1,
  asked: new Set(),
  loaded: new Set(),
  pending: null,
  said: { c: -1, v: -1, f: -1 },
  selC: -1,
  self: 0,
  moving: false,
  restTimer: 0,
  wakeTimer: 0,

  setCount(n) {
    this.count = n;
  },

  section(c) {
    let s = this.main.querySelector(`section[data-c="${c}"]`);
    if (!s) {
      s = el("section", "ch wait");
      s.dataset.c = c;
    }
    return s;
  },

  want(c) {
    if (c < 0 || c >= this.count || this.asked.has(c)) return;
    this.asked.add(c);
    send(`want ${c}`);
  },

  // The reader to chapter c's verse v (0: its top), f thousandths of an em
  // into it: there now if it is on the page, else the page made again
  // around it.
  jump(c, v, f) {
    if (c < 0 || c >= this.count) return;
    if (!(c >= this.lo && c <= this.hi && this.loaded.has(c))) {
      this.main.textContent = "";
      this.loaded.clear();
      this.asked.clear();
      this.lo = c;
      this.hi = c;
      this.main.appendChild(this.section(c));
      this.want(c);
    }
    this.pending = { c, v, f };
    if (this.loaded.has(c)) this.finishJump();
  },

  finishJump() {
    const j = this.pending;
    if (!j) return;
    this.pending = null;
    const s = this.section(j.c);
    let y = s.getBoundingClientRect().top;
    if (j.v > 0) {
      const t = s.querySelector(`[data-v="${j.v}"]`);
      if (t) y = t.getBoundingClientRect().top - (j.f * emPx()) / 1000;
    }
    this.scrollTo(window.scrollY + y - barHeight());
    this.extend();
    // (Told now: a jump to where the page already is scrolls nothing.)
    requestAnimationFrame(() => {
      this.tell();
      clearTimeout(this.restTimer);
      this.restTimer = setTimeout(() => this.rested(), 160);
    });
  },

  scrollTo(y) {
    this.self++;
    window.scrollTo(0, Math.max(0, y));
    requestAnimationFrame(() => this.self--);
  },

  // More chapters put on the page while either end is near; one above the
  // place put in without moving what is read.
  extend() {
    const top = window.scrollY;
    const height = document.documentElement.scrollHeight;
    if (this.hi < this.count - 1 && top + innerHeight * 2.5 > height) {
      this.hi++;
      this.main.appendChild(this.section(this.hi));
      this.want(this.hi);
    }
    if (this.lo > 0 && top < innerHeight * 1.5) {
      this.lo--;
      this.keepPlace(() => this.main.insertBefore(this.section(this.lo), this.main.firstChild));
      this.want(this.lo);
    }
  },

  // A change above the place made without moving the place.
  keepPlace(change) {
    const anchor = this.anchor();
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    change();
    if (anchor) {
      const d = anchor.getBoundingClientRect().top - before;
      if (Math.abs(d) > 0.5) this.scrollTo(window.scrollY + d);
    }
  },

  // The first chapter on the screen (below the bar).
  anchor() {
    const y = barHeight() + 2;
    for (const s of this.main.children) if (s.getBoundingClientRect().bottom > y) return s;
    return null;
  },

  // chapter C's lines: its text, then span, verse, link and mark lines.
  chapter(c, text, lines) {
    const s = this.section(c);
    if (!s.isConnected) {
      // (Not on the page any more: kept for when it is.)
      return;
    }
    const spans = [];
    const verses = [];
    const links = [];
    const marks = new Map();
    for (const w of lines) {
      const k = w.word(0);
      if (k === "span") spans.push([w.num(1), w.num(2), w.num(3), w.num(4)]);
      else if (k === "verse") verses.push([w.num(1), w.num(2), w.num(3)]);
      else if (k === "link") links.push([w.num(1), w.num(2), w.num(3), Number(w.word(4))]);
      else if (k === "mark") marks.set(w.num(1), { hex: w.word(2), bm: w.num(3) === 1, note: w.num(4) === 1 });
    }
    const body = layChapter(text, spans, verses, links, marks);
    const above = s.getBoundingClientRect().bottom <= barHeight() + 1 && this.loaded.size > 0;
    const put = () => {
      s.replaceChildren(body);
      s.classList.remove("wait");
      s.links = links;
    };
    if (above) this.keepPlace(put);
    else put();
    this.loaded.add(c);
    if (c === this.selC) this.paintSelection();
    if (this.pending && this.pending.c === c) this.finishJump();
    else this.extend();
  },

  // Every chapter laid out again (the settings or the version changed), at
  // the same place.
  relayout() {
    const p = this.said.c >= 0 ? { ...this.said } : null;
    this.loaded.clear();
    this.asked.clear();
    this.main.textContent = "";
    this.lo = 0;
    this.hi = -1;
    if (p) this.jump(p.c, p.v, p.f);
  },

  // The place at the top: chapter, verse and how far into it, told as it
  // changes.
  place() {
    const y = barHeight() + 1;
    const s = this.anchor();
    if (!s || !this.loaded.has(+s.dataset.c)) return null;
    const c = +s.dataset.c;
    let v = 0;
    let f = 0;
    const x = Math.min(innerWidth - 1, Math.max(1, s.getBoundingClientRect().left + s.clientWidth / 2));
    let at = document.elementFromPoint(x, y + 2);
    at = at && at.closest ? at.closest("[data-v]") : null;
    if (at && s.contains(at)) {
      v = +at.dataset.v;
      const first = s.querySelector(`[data-v="${v}"]`);
      f = Math.max(0, Math.round(((y - first.getBoundingClientRect().top) * 1000) / emPx()));
    } else {
      // (Between verses, or above the first: the last verse begun.)
      for (const t of s.querySelectorAll("[data-vs]")) {
        if (t.getBoundingClientRect().top <= y) {
          v = +t.dataset.v;
          f = Math.max(0, Math.round(((y - t.getBoundingClientRect().top) * 1000) / emPx()));
        }
      }
    }
    return { c, v, f };
  },

  tell() {
    if (this.pending) return;
    const p = this.place();
    if (!p) return;
    const s = this.said;
    if (p.c !== s.c || p.v !== s.v || Math.abs(p.f - s.f) > 400) {
      const chapterChanged = p.c !== s.c;
      this.said = p;
      send(`place ${p.c} ${p.v} ${p.f}`);
      if (chapterChanged) address(p.c);
    }
  },

  // The reader at rest: where, whether that chapter's end is on the
  // screen, and the last chapter whose end is.
  rested() {
    this.moving = false;
    this.tell();
    const p = this.said;
    if (p.c < 0) return;
    const bottom = innerHeight;
    let end = 0;
    let endsHi = p.c - 1;
    for (const s of this.main.children) {
      const c = +s.dataset.c;
      if (c < p.c || !this.loaded.has(c)) continue;
      if (s.getBoundingClientRect().bottom <= bottom) {
        endsHi = c;
        if (c === p.c) end = 1;
      }
    }
    send(`rest ${p.c} ${p.v} ${p.f} ${end} ${endsHi} ${clock()}`);
  },

  scrolled() {
    if (!this.self && this.userMoving) {
      this.userMoving = false;
      if (!this.moving) {
        this.moving = true;
        send(`moving ${clock()}`);
      }
    }
    this.extend();
    this.tell();
    clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => this.rested(), 160);
  },

  // The time core asked for (ms on this clock): tick then.
  wake(at) {
    clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(() => send(`tick ${clock()}`), Math.max(50, at - clock()));
  },

  // A page down (1) or up (-1), less three lines.
  page(d) {
    const line = emPx() * look.spacing;
    window.scrollBy({ top: d * Math.max(line, innerHeight - barHeight() - 3 * line), behavior: "smooth" });
  },

  // Listen's verse followed: moved to it if it isn't on the screen.
  follow(c, v) {
    const s = this.main.querySelector(`section[data-c="${c}"]`);
    const t = s && this.loaded.has(c) ? s.querySelector(`[data-v="${v}"]`) : null;
    if (t) {
      const r = t.getBoundingClientRect();
      if (r.top >= barHeight() && r.top < innerHeight * 0.7) return;
      this.scrollTo(window.scrollY + r.top - barHeight() - innerHeight / 4);
      return;
    }
    this.jump(c, v, 0);
  },

  // Core's selection (its chapter, -1 none, then its verses), painted.
  selection(words) {
    const w = words.trim().split(" ").map(Number);
    const was = this.selC;
    this.selC = w[0] ?? -1;
    this.sel = new Set(this.selC >= 0 ? w.slice(1) : []);
    if (was >= 0 && was !== this.selC) this.paint(was, new Set());
    this.paintSelection();
  },

  paintSelection() {
    if (this.selC >= 0) this.paint(this.selC, this.sel);
  },

  paint(c, vs) {
    const s = this.main.querySelector(`section[data-c="${c}"]`);
    if (!s) return;
    for (const t of s.querySelectorAll("[data-v]")) t.classList.toggle("sel", vs.has(+t.dataset.v));
  },

  // What is marked on the selected chapter changed: asked for again.
  reaskSelected() {
    const c = this.selC >= 0 ? this.selC : this.said.c;
    if (c < 0) return;
    this.asked.delete(c);
    this.want(c);
  },

  tapped(e) {
    if (String(window.getSelection())) return;
    const s = e.target.closest("section[data-c]");
    if (!s) return;
    const c = +s.dataset.c;
    const t = e.target.closest("[data-l]");
    if (t && s.links) {
      const l = s.links[+t.dataset.l];
      if (l) {
        send(l[2] === 0 ? `footnote ${c} ${l[3]}` : l[2] === 2 ? `word ${l[3]}` : `preview ${l[3]}`);
        return;
      }
    }
    const v = e.target.closest("[data-v]");
    send(v && +v.dataset.v > 0 ? `tapverse ${c} ${v.dataset.v}` : "tapnone");
  },
};

// A chapter laid out as the page's paragraphs: each line of its text a
// paragraph (its kind from its runs), each run a span in its style, with
// its verse (data-v; data-vs on a verse's first), its link (data-l) and
// its highlight.
function layChapter(text, spans, verses, links, marks) {
  const frag = document.createDocumentFragment();
  const cuts = new Set([0, text.length]);
  for (const s of spans) {
    cuts.add(s[0]);
    cuts.add(s[1]);
  }
  for (const v of verses) {
    cuts.add(v[1]);
    cuts.add(v[2]);
  }
  for (const l of links) {
    cuts.add(l[0]);
    cuts.add(l[1]);
  }
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
    cuts.add(i);
    cuts.add(i + 1);
  }
  const at = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);
  let si = 0;
  let p = el("p");
  let paraSet = false;
  const firstOf = new Set();
  const seen = new Set();
  for (let i = 0; i + 1 < at.length; i++) {
    const a = at[i];
    const b = at[i + 1];
    if (text[a] === "\n") {
      if (!p.childNodes.length) p.append(" ");
      frag.appendChild(p);
      p = el("p");
      paraSet = false;
      continue;
    }
    while (si < spans.length && spans[si][1] <= a) si++;
    const sp = si < spans.length && spans[si][0] <= a ? spans[si] : null;
    if (sp && !paraSet) {
      const para = sp[3];
      p.className = `pk${para % 16}${para >= 16 ? " tight" : ""}`;
      paraSet = true;
    }
    const span = el("span", sp ? `s${sp[2]}` : "", text.slice(a, b));
    let v = null;
    for (const x of verses) if (x[1] <= a && a < x[2]) v = x[0];
    if (v != null) {
      span.dataset.v = v;
      if (!seen.has(v)) {
        seen.add(v);
        span.dataset.vs = "1";
        firstOf.add(v);
      }
      const m = marks.get(v);
      if (m && m.hex !== "-") span.style.backgroundColor = hexAlpha(m.hex, look.dark ? 0.32 : 0.4);
    }
    const li = links.findIndex((l) => l[0] <= a && a < l[1]);
    if (li >= 0) span.dataset.l = li;
    p.appendChild(span);
  }
  if (p.childNodes.length) frag.appendChild(p);
  return frag;
}

reader.main.addEventListener("click", (e) => reader.tapped(e));
for (const t of ["wheel", "touchmove", "pointerdown"]) addEventListener(t, () => (reader.userMoving = true), { passive: true });
addEventListener("scroll", () => reader.scrolled(), { passive: true });

// The address: the place's chapter, as the browser keeps it (no new entry).
function address(c) {
  const a = chapterAddress(c);
  const v = /^[A-Z]{3}$/.test(bar.versionWord) ? bar.versionWord.toLowerCase() : "bsb";
  if (a) history.replaceState(history.state, "", `/read/${v}/${a}`);
}

// ---- menus ----
let menuOpen = null;

function popup(anchor, items) {
  closeMenu();
  const m = el("div", "menu");
  m.setAttribute("role", "menu");
  for (const it of items) {
    const b = el("button", it.destructive ? "destructive" : "", it.title);
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.addEventListener("click", () => {
      closeMenu();
      it.run();
    });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
  const below = r.bottom + 4;
  m.style.top = (below + m.offsetHeight < innerHeight ? below : Math.max(8, r.top - m.offsetHeight - 4)) + "px";
  menuOpen = m;
  m.querySelector("button")?.focus();
}

function closeMenu() {
  if (menuOpen) menuOpen.remove();
  menuOpen = null;
}

addEventListener("pointerdown", (e) => {
  if (menuOpen && !menuOpen.contains(e.target)) closeMenu();
});

// ---- the panel: core's screens ----
// Beside the reader on a wide window, over it on a narrow one; a stack of
// screens, the top one shown, its Back the browser's too.
const panel = {
  box: null,
  stack: [],
  fields: new Map(),
  typed: 0,
  pending: null,
  shown: -1,
  depth: 0,
  ignorePops: 0,

  init() {
    const p = el("aside", "panel");
    p.hidden = true;
    p.setAttribute("aria-label", "Panel");
    p.innerHTML = `<div class="pbar"><button type="button" class="pback"></button><h2 class="ptitle"></h2><button type="button" class="psort" hidden></button><button type="button" class="pbutton" hidden></button></div><div class="pfield" hidden><input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"></div><div class="pscopes" hidden></div><div class="psegments" hidden></div><div class="pfilter" hidden></div><div class="plist"></div><div class="ptools" hidden></div>`;
    document.body.appendChild(p);
    this.box = p;
    $(".pback", p).addEventListener("click", () => {
      const s = this.top();
      if (s && s.left && s.leftAction) send(`act ${s.id} ${s.leftAction} 0 0`);
      else this.userBack();
    });
    $(".pbutton", p).addEventListener("click", (e) => this.barButton(e.currentTarget));
    $(".psort", p).addEventListener("click", (e) => {
      const s = this.top();
      popup(e.currentTarget, s.sorts.map((t, i) => ({ title: (i === s.sort ? "✓ " : "") + t, run: () => send(`act ${s.id} ${s.sortAction} 0 ${i}`) })));
    });
    const f = $(".pfield input", p);
    f.addEventListener("input", () => {
      const s = this.top();
      if (!s) return;
      clearTimeout(this.pending);
      this.pending = setTimeout(() => send(`query ${s.id} ${escape(f.value)}`), s.wait || 0);
    });
    f.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const s = this.top();
      if (!s) return;
      clearTimeout(this.pending);
      send(`query ${s.id} ${escape(f.value)}`);
      send(`submit ${s.id}`);
    });
    p.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.userBack();
      }
    });
    addEventListener("popstate", () => this.popped());
  },

  top() {
    return this.stack.length ? screens.get(this.stack[this.stack.length - 1]) : null;
  },

  present(id) {
    this.stack = [id];
    this.show(true);
    this.syncHistory();
  },

  push(id) {
    this.stack.push(id);
    this.show(true);
    this.syncHistory();
  },

  update(id) {
    if (!this.stack.length || this.stack[this.stack.length - 1] !== id) return;
    this.show(false);
  },

  dismiss() {
    if (!this.stack.length) return;
    this.stack = [];
    this.fields.clear();
    this.hide();
    this.syncHistory();
  },

  popTo(id) {
    if (!this.stack.includes(id)) return;
    while (this.stack[this.stack.length - 1] !== id) this.fields.delete(this.stack.pop());
    this.show(false);
    this.syncHistory();
  },

  // Back: the top screen let go, and core told (its field's words first).
  back(tell = true) {
    if (!this.stack.length) return;
    const id = this.stack[this.stack.length - 1];
    if (tell) this.commitField(id);
    this.stack.pop();
    this.fields.delete(id);
    if (tell) send(`closed ${id}`);
    if (this.stack.length) this.show(false);
    else this.hide();
    this.syncHistory();
  },

  // Back, as the browser's Back is: one entry of its history.
  userBack() {
    if (this.depth > 0) history.back();
    else this.back(true);
  },

  // The browser's history kept one entry a screen deep.
  syncHistory() {
    const n = this.stack.length;
    while (this.depth < n) {
      this.depth++;
      history.pushState({ sb: this.depth }, "");
    }
    if (this.depth > n) {
      this.ignorePops++;
      history.go(n - this.depth);
      this.depth = n;
    }
  },

  popped() {
    // (The address is the place's, whichever entry is back.)
    if (reader.said.c >= 0) address(reader.said.c);
    if (this.ignorePops > 0) {
      this.ignorePops--;
      return;
    }
    const to = history.state?.sb ?? 0;
    this.depth = Math.min(this.depth, to);
    while (this.stack.length > to) this.back(true);
    this.depth = to;
  },

  hide() {
    this.box.hidden = true;
    document.body.classList.remove("panel-open");
    this.shown = -1;
  },

  commitField(id) {
    const f = this.fields.get(id);
    const s = screens.get(id);
    if (!f || !s) return;
    const r = fieldRow(s);
    if (!r || r.flag("l")) return;
    send(`text ${id} ${r.action} ${r.arg} ${escape(f.value)}`);
  },

  retext(id) {
    const s = screens.get(id);
    if (!s || this.shown !== id) return;
    $(".pfield input", this.box).value = s.searchText;
  },

  barButton(b) {
    const s = this.top();
    if (!s) return;
    if (s.confirm) {
      this.commitField(s.id);
      send(`act ${s.id} ${s.confirmAction} 0 0`);
    } else if (s.commands.length) popup(b, s.commands.map((c) => ({ title: c.title, destructive: c.destructive, run: () => send(`act ${s.id} ${c.action} ${c.arg} 0`) })));
  },

  act(s, r, value = 0) {
    send(`act ${s.id} ${r.action} ${r.arg} ${value}`);
  },

  // The top screen shown (fresh: just opened, at its focus).
  show(fresh) {
    const s = this.top();
    if (!s) return;
    const p = this.box;
    const typingIn = this.fields.get(s.id);
    const focused = typingIn && document.activeElement === typingIn ? [typingIn.selectionStart, typingIn.selectionEnd] : null;
    const list = $(".plist", p);
    const scroll = fresh ? 0 : list.scrollTop;
    $(".ptitle", p).textContent = s.title;
    const back = $(".pback", p);
    back.replaceChildren(s.left ? document.createTextNode(s.left) : icon(this.stack.length > 1 ? "chevron-left" : "x"));
    back.setAttribute("aria-label", s.left || (this.stack.length > 1 ? "Back" : "Close"));
    const bt = s.confirm || s.button;
    const button = $(".pbutton", p);
    button.hidden = !bt;
    button.textContent = bt;
    button.disabled = s.confirm ? s.confirmOff : !s.commands.length;
    button.classList.toggle("strong", !!s.confirm);
    const sort = $(".psort", p);
    sort.hidden = !s.sorts.length;
    if (s.sorts.length) sort.textContent = `${s.sorts[Math.max(0, Math.min(s.sort, s.sorts.length - 1))]} ▾`;
    // (Its field: another screen's words as core has them.)
    const fieldBox = $(".pfield", p);
    fieldBox.hidden = !s.search;
    const input = $("input", fieldBox);
    input.placeholder = s.search;
    input.enterKeyHint = s.go ? "go" : "search";
    if (this.shown !== s.id) {
      clearTimeout(this.pending);
      input.value = s.searchText;
    }
    this.showScopes(s);
    this.showSegments(s);
    this.showFilter(s);
    this.showTools(s);
    list.replaceChildren(this.rows(s));
    list.classList.toggle("page", !!s.page);
    p.hidden = false;
    document.body.classList.add("panel-open");
    // (Its field takes the keys as it opens: where core says, and wherever
    // there is a keyboard and a pointer, as a web page's search does.)
    const typeIn = s.search && (s.focusField || !matchMedia("(pointer: coarse)").matches);
    if (fresh && typeIn) input.focus();
    if (focused && this.fields.get(s.id)) {
      const f = this.fields.get(s.id);
      f.focus();
      f.setSelectionRange(focused[0], focused[1]);
    }
    if (fresh) {
      const fr = list.querySelector(".focus");
      if (fr) {
        const at = fr.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
        list.scrollTop = at - (s.focusMode === 1 || s.focusMode === 2 ? list.clientHeight / 2 : 8);
        if (s.focusMode === 3) fr.classList.add("washed");
      } else list.scrollTop = 0;
      if (!typeIn) $(".pback", p).focus({ preventScroll: true });
    } else list.scrollTop = scroll;
    this.shown = s.id;
  },

  showScopes(s) {
    const box = $(".pscopes", this.box);
    box.hidden = !s.scopes.length;
    box.replaceChildren(...s.scopes.map((t, i) => {
      const b = el("button", i === s.scope ? "on" : "", t);
      b.type = "button";
      if (s.scopeLabels[i]) b.setAttribute("aria-label", s.scopeLabels[i]);
      b.setAttribute("aria-pressed", i === s.scope);
      b.addEventListener("click", () => send(`scope ${s.id} ${i}`));
      return b;
    }));
  },

  showSegments(s) {
    const box = $(".psegments", this.box);
    box.hidden = !s.segments.length;
    box.replaceChildren(...s.segments.map((t, i) => {
      const b = el("button", i === s.segment ? "on" : "", t);
      b.type = "button";
      b.setAttribute("aria-pressed", i === s.segment);
      b.addEventListener("click", () => send(`act ${s.id} ${s.segmentsAction} 0 ${i}`));
      return b;
    }));
  },

  showFilter(s) {
    const box = $(".pfilter", this.box);
    box.hidden = !s.filterColors.length;
    const all = el("button", s.filter < 0 ? "on" : "", "All");
    all.type = "button";
    all.addEventListener("click", () => send(`act ${s.id} ${s.filterAction} 0 -1`));
    box.replaceChildren(all, ...s.filterColors.map((hex, i) => {
      const b = el("button", "dot" + (i === s.filter ? " on" : ""));
      b.type = "button";
      b.style.background = "#" + hex;
      b.setAttribute("aria-label", s.filterLabels[i] || hex);
      b.addEventListener("click", () => send(`act ${s.id} ${s.filterAction} 0 ${i}`));
      return b;
    }));
  },

  // The buttons at its foot: left, middle, right.
  showTools(s) {
    const box = $(".ptools", this.box);
    box.hidden = !s.tools.length;
    const places = [el("div", "left"), el("div", "middle"), el("div", "right")];
    for (const t of s.tools) {
      const b = el("button", `tool st${t.style}`);
      b.type = "button";
      b.textContent = t.title || t.label || glyph(t.icon);
      if (t.label) b.setAttribute("aria-label", t.label);
      b.disabled = t.style === 3;
      b.addEventListener("click", () => {
        if (t.menu) popup(b, split(t.menu).map((m) => {
          const k = m.indexOf(":");
          return { title: m.slice(k + 1), run: () => send(`act ${s.id} ${t.action} ${m.slice(0, k)} 0`) };
        }));
        else send(`act ${s.id} ${t.action} ${t.arg} 0`);
      });
      places[Math.max(0, Math.min(2, t.place))].appendChild(b);
    }
    box.replaceChildren(...places);
  },

  // The screen's rows: its hero, intro, sections (headers, rows, footers).
  rows(s) {
    const frag = document.createDocumentFragment();
    if (s.hero) {
      const h = el("div", "hero");
      h.append(el("div", "hw", s.hero), el("div", "hs", s.heroSub));
      if (s.heroLine) h.appendChild(rich(el("div", "hl"), s.heroLine, s.heroRuns));
      frag.appendChild(h);
    }
    if (s.intro) frag.appendChild(rich(el("div", "intro" + (s.introQuote ? " quote" : "")), s.intro, s.introRuns));
    let n = 0;
    let none = true;
    for (const sec of s.sections) {
      if (sec.rows.length) none = false;
      const head = el("div", "phead");
      if (sec.header || sec.suffix || sec.button) {
        const h = el("h3");
        h.append(sec.header);
        if (sec.suffix) h.appendChild(el("span", "suffix", sec.suffix));
        head.appendChild(h);
        if (sec.button) {
          const b = el("button", "hbutton", sec.button);
          b.type = "button";
          b.addEventListener("click", () => send(`act ${s.id} ${sec.buttonAction} 0 0`));
          head.appendChild(b);
        }
        frag.appendChild(head);
      } else if (n > 0) frag.appendChild(el("div", "gap"));
      if (sec.columns.length) {
        const cols = el("div", "cols");
        cols.appendChild(el("span", "label"));
        for (const c of sec.columns) cols.appendChild(el("span", "", c));
        frag.appendChild(cols);
      }
      const box = el("div", s.grid ? "grid" : s.plain || s.page ? "rows plain" : "rows");
      for (const r of sec.rows) {
        const v = s.grid ? this.gridButton(s, r) : this.row(s, r);
        if (n === s.focus) v.classList.add("focus");
        n++;
        box.appendChild(v);
      }
      if (sec.rows.length) frag.appendChild(box);
      if (sec.footer) frag.appendChild(el("p", "footer", sec.footer));
      if (sec.credit === 1) {
        const a = el("a", "credit", "(ESV) · esv.org");
        a.href = "https://www.esv.org";
        a.target = "_blank";
        a.rel = "noopener";
        frag.appendChild(a);
      }
    }
    if (none && s.emptyTitle) {
      const e = el("div", "empty");
      e.append(el("h3", "", s.emptyTitle), el("p", "", s.emptyLine));
      frag.appendChild(e);
    }
    return frag;
  },

  gridButton(s, r) {
    const b = el("button", "cell" + (r.acc === "check" ? " on" : ""), String(r.value));
    b.type = "button";
    b.setAttribute("aria-label", r.title);
    b.addEventListener("click", () => this.act(s, r));
    return b;
  },

  row(s, r) {
    if (r.kind === "field") return this.fieldRow(s, r);
    if (r.kind === "text") return this.textRow(s, r);
    if (r.kind === "tiles") return this.tilesRow(s, r);
    if (r.cells.length) return this.cellsRow(s, r);
    if (r.custom === CUSTOM_SWATCHES) return this.swatches(s, r);
    const tappable = r.kind === "item" || r.kind === "button" || r.kind === "custom";
    const line = el("div", `row k-${r.kind}`);
    if (r.flag("d")) line.classList.add("off");
    if (r.label) line.setAttribute("aria-label", r.label);
    if (r.circle > 0) {
      const ci = el("button", `circle c${r.circle}`, r.circle === 3 ? "●" : r.circle === 2 ? "◐" : "○");
      ci.type = "button";
      ci.disabled = r.flag("k");
      ci.setAttribute("aria-label", r.circle === 3 ? "Read" : r.circle === 2 ? "Partly read" : "Not read");
      ci.addEventListener("click", (e) => {
        e.stopPropagation();
        send(`act ${s.id} ${r.circleAction} ${r.arg} 0`);
      });
      line.appendChild(ci);
    } else if (r.icon) {
      const g = glyph(r.icon);
      if (g) {
        const ic = el("span", "ricon" + (r.flag("g") ? " faint" : ""), g);
        if (r.iconColor) ic.style.color = "#" + r.iconColor;
        ic.setAttribute("aria-hidden", "true");
        line.appendChild(ic);
      }
    }
    if (r.lead) line.appendChild(el("span", "lead", r.lead));
    const words = el("div", "words");
    const t = el("div", "rt");
    rich(t, r.title, r.truns);
    if (r.suffix) t.appendChild(el("span", "suffix", r.suffix));
    if (r.flag("x") || r.flag("t")) t.classList.add("accent");
    if (r.flag("f")) t.classList.add("faint");
    if (r.flag("b")) t.classList.add("strong");
    if (r.titleLines > 0) t.style.webkitLineClamp = r.titleLines;
    if (r.custom === CUSTOM_HIT) line.classList.add("hit");
    words.appendChild(t);
    if (r.detail && !r.flag("v")) {
      const d = el("div", "rd" + (r.flag("m") ? " small" : "") + (r.flag("s") ? " scripture" : ""));
      if (r.runs.length) rich(d, r.detail, r.runs);
      else marked(d, r);
      const lines = r.lines > 0 ? r.lines : r.flag("s") ? (r.flag("b") ? 2 : 1) : r.custom === CUSTOM_HIT && !r.runs.length ? 4 : 0;
      if (lines) {
        d.classList.add("clamp");
        d.style.webkitLineClamp = lines;
      }
      words.appendChild(d);
    }
    if (r.note) words.appendChild(el("div", "rn", r.note));
    line.appendChild(words);
    if (r.side) {
      const side = el("div", "side");
      side.appendChild(rich(el("div", "sw"), r.side, r.sruns));
      side.appendChild(el("div", "sn", r.sideNote));
      line.appendChild(side);
    }
    if (r.flag("w")) line.appendChild(el("span", "spin"));
    if (r.trailing) line.appendChild(el("span", "trailing" + (r.flag("a") ? " accent" : ""), r.trailing));
    if (tappable) {
      if (r.detail && r.flag("v")) line.appendChild(el("span", "value", r.detail));
      const mark = r.acc === "check" || r.acc === "done" ? "check" : r.acc === "more" ? "chevron-right" : r.acc === "link" ? "arrow-up-right" : "";
      if (mark) {
        const a = el("span", `acc acc-${r.acc}`);
        a.appendChild(icon(mark));
        if (r.acc === "done") a.setAttribute("aria-label", "Today’s read");
        line.appendChild(a);
      }
      if (r.info) {
        const inf = el("button", "info");
        inf.type = "button";
        inf.appendChild(icon("info"));
        inf.setAttribute("aria-label", "Details");
        inf.addEventListener("click", (e) => {
          e.stopPropagation();
          send(`act ${s.id} ${r.info} ${r.arg} 0`);
        });
        line.appendChild(inf);
      }
      if (r.flag("u") && r.actions.length) {
        const more = el("button", "more");
        more.type = "button";
        more.appendChild(icon("more"));
        more.setAttribute("aria-label", "More");
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          this.menu(s, r, more);
        });
        line.appendChild(more);
      }
      if (!r.flag("d") && (r.action || r.kind === "button")) {
        line.tabIndex = 0;
        line.setAttribute("role", "button");
        line.addEventListener("click", () => this.act(s, r));
        line.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.act(s, r);
          }
        });
      }
    } else if (r.kind === "toggle") {
      const sw = el("input", "switch");
      sw.type = "checkbox";
      sw.setAttribute("role", "switch");
      sw.checked = r.flag("o");
      sw.setAttribute("aria-label", r.label || r.title);
      sw.addEventListener("change", () => this.act(s, r, sw.checked ? 1 : 0));
      line.addEventListener("click", (e) => {
        if (e.target !== sw) sw.click();
      });
      line.appendChild(sw);
    } else if (r.kind === "time") {
      const tm = el("input", "time");
      tm.type = "time";
      tm.value = `${String(Math.floor(r.value / 60)).padStart(2, "0")}:${String(r.value % 60).padStart(2, "0")}`;
      tm.addEventListener("change", () => {
        const [h, m] = tm.value.split(":").map(Number);
        if (Number.isFinite(h)) this.act(s, r, h * 60 + (m || 0));
      });
      line.appendChild(tm);
    } else if (r.kind === "slider") {
      line.classList.add("slider");
      const range = el("input");
      range.type = "range";
      range.min = r.lo;
      range.max = r.hi;
      range.value = r.value;
      range.setAttribute("aria-label", r.label || r.title);
      range.addEventListener("change", () => this.act(s, r, +range.value));
      line.appendChild(range);
    } else if (r.kind === "choice") {
      const sel = el("select");
      split(r.options).forEach((o, i) => {
        const opt = el("option", "", o);
        opt.value = i;
        if (i === r.value) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.setAttribute("aria-label", r.label || r.title);
      sel.addEventListener("change", () => this.act(s, r, +sel.value));
      line.appendChild(sel);
    }
    if (r.del || (r.actions.length && !r.flag("u"))) {
      line.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.menu(s, r, line);
      });
    }
    return line;
  },

  // A row's actions (and Delete) as a menu.
  menu(s, r, anchor) {
    const items = r.actions.map((a) => ({ title: a.title, destructive: a.action === r.del, run: () => send(`act ${s.id} ${a.action} ${r.arg} 0`) }));
    if (r.del && !r.actions.some((a) => a.action === r.del)) items.push({ title: "Delete", destructive: true, run: () => send(`act ${s.id} ${r.del} ${r.arg} 0`) });
    if (items.length) popup(anchor, items);
  },

  // A page's paragraph: its words by their runs, its links doing their
  // actions; a heading larger.
  textRow(s, r) {
    const practice = r.truns.some(([, st]) => st >= RUN_PRACTICE);
    const scripture = r.truns.some(([, st]) => st < 100);
    const p = el("p", "para" + (r.flag("h") ? " heading" : "") + (practice ? " practice" : scripture ? " scripture" : ""));
    if (r.flag("h")) p.setAttribute("role", "heading");
    rich(p, r.title, r.truns, r.links, (l) => send(`act ${s.id} ${l[2]} ${l[3]} 0`));
    if (r.value > 0 || r.lo > 0) {
      p.style.paddingLeft = `calc(${(r.value + r.lo) / 10}em + var(--side))`;
      p.style.textIndent = `${-r.lo / 10}em`;
    }
    if (r.label) p.setAttribute("aria-label", r.label);
    return p;
  },

  // A field (New Ribbon's name, a note): kept across the screen's updates,
  // so that typing in it goes on.
  fieldRow(s, r) {
    let f = this.fields.get(s.id);
    if (!f) {
      f = r.fieldKind === 2 ? el("textarea") : el("input");
      if (r.fieldKind !== 2) f.type = "text";
      if (r.fieldKind === 2) f.rows = 8;
      f.value = r.detail;
      f.autocapitalize = r.fieldKind === 1 ? "words" : "sentences";
      if (r.fieldKind === 1) f.spellcheck = false;
      f.addEventListener("input", () => {
        this.typed = Date.now();
        const now = fieldRow(s);
        if (now && now.flag("l")) send(`text ${s.id} ${now.action} ${now.arg} ${escape(f.value)}`);
      });
      f.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || r.fieldKind === 2) return;
        e.preventDefault();
        const now = fieldRow(s);
        if (!now) return;
        if (!now.flag("l")) send(`text ${s.id} ${now.action} ${now.arg} ${escape(f.value)}`);
        if (now.flag("r") && s.confirm) send(`act ${s.id} ${s.confirmAction} 0 0`);
        else f.blur();
      });
      f.addEventListener("blur", () => this.commitField(s.id));
      this.fields.set(s.id, f);
      if (s.focus >= 0) setTimeout(() => f.focus(), 0);
    }
    f.placeholder = r.title;
    if (r.label) f.setAttribute("aria-label", r.label);
    const box = f.parentElement?.classList.contains("frow") ? f.parentElement : el("div", "frow");
    if (f.parentElement !== box) box.appendChild(f);
    return box;
  },

  // The interlinear's words: a tile each, in lines (right to left for the
  // Hebrew's order).
  tilesRow(s, r) {
    const flow = el("div", "tiles" + (r.value === 1 ? " rtl" : ""));
    for (const c of r.cells) {
      const added = c.flags & 16;
      const t = el(added ? "div" : "button", "tile");
      const sub = el("span", "tsub" + (added || c.flags & 8 ? " faint" : "") + (c.flags & 4 ? " helped" : ""), c.sub);
      if (c.flags & 1) sub.classList.add("hidden");
      t.appendChild(sub);
      if (!added) {
        t.type = "button";
        t.append(el("span", "torig", c.text));
        const tr = el("span", "ttr", c.tr);
        if (c.flags & 2) tr.classList.add("hidden");
        t.append(tr, el("span", "tcode", c.count));
        t.setAttribute("aria-label", c.label);
        t.addEventListener("click", () => send(`act ${s.id} ${c.action} ${c.arg} 0`));
        if (c.actions.length) t.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          popup(t, c.actions.map((a) => ({ title: a.title, run: () => send(`act ${s.id} ${a.action} ${c.arg} 0`) })));
        });
      }
      flow.appendChild(t);
    }
    return flow;
  },

  // A grid's row: its label, then its cells (a form over its count).
  cellsRow(s, r) {
    const line = el("div", "cells");
    line.appendChild(el("span", "label", r.title));
    for (const c of r.cells) {
      const col = el(c.action ? "button" : "div", "gcell");
      if (c.action) {
        col.type = "button";
        col.addEventListener("click", () => send(`act ${s.id} ${c.action} ${c.arg} 0`));
      }
      col.appendChild(el("span", c.script ? "gform" : "gform faint", c.text));
      if (c.sub) col.appendChild(el("span", "gsub", c.sub));
      if (c.count) col.appendChild(el("span", "gcount", c.count));
      col.setAttribute("aria-label", c.label);
      line.appendChild(col);
    }
    return line;
  },

  // The ribbons' colors: a circle each, the chosen ringed.
  swatches(s, r) {
    const line = el("div", "swatches");
    const names = split(r.detail);
    split(r.options).forEach((hex, j) => {
      const d = el("button", "dot" + (j === r.value ? " on" : ""));
      d.type = "button";
      d.style.background = "#" + hex;
      d.setAttribute("aria-label", names[j] || hex);
      d.addEventListener("click", () => this.act(s, r, j));
      line.appendChild(d);
    });
    return line;
  },
};

function fieldRow(s) {
  for (const sec of s.sections) for (const r of sec.rows) if (r.kind === "field") return r;
  return null;
}

// A row's detail, the places its screen's field found stressed.
function marked(node, r) {
  if (r.marks.length < 2) {
    node.textContent = r.detail;
    return;
  }
  let at = 0;
  for (let i = 0; i + 1 < r.marks.length; i += 2) {
    const b = Math.max(at, Math.min(r.marks[i], r.detail.length));
    const e = Math.max(b, Math.min(r.marks[i + 1], r.detail.length));
    node.append(r.detail.slice(at, b));
    node.appendChild(el("mark", "", r.detail.slice(b, e)));
    at = e;
  }
  node.append(r.detail.slice(at));
}

// An icon core names (an SF Symbol's name) as a character, where one reads
// as it ("" for those left out).
function glyph(name) {
  return {
    ribbon: "▮", plus: "+", circle: "○", "circle.lefthalf.filled": "◐", "checkmark.circle.fill": "●",
    "clock.arrow.circlepath": "↺", globe: "⊕", "arrow.right.circle.fill": "→", "square.and.arrow.up": "⇪",
    "square.and.pencil": "✎", "chevron.up": "⌃", "chevron.down": "⌄", "play.fill": "▶", repeat: "↻",
    "speaker.wave.2": "🔈", keyboard: "⌨", "keyboard.chevron.compact.down": "⌨", "book.closed": "📖", brain: "✦",
    calendar: "▦", magnifyingglass: "⌕", bookmark: "🔖", "highlighter": "✎", "note.text": "✎", trash: "🗑",
  }[name] ?? "";
}

// ---- the selection's toolbar (core's tray, screen 0) ----
const tray = {
  box: null,
  init() {
    this.box = el("div", "tray");
    this.box.hidden = true;
    this.box.setAttribute("role", "toolbar");
    document.body.appendChild(this.box);
  },
  show(s) {
    if (!s) return;
    const b = this.box;
    b.replaceChildren();
    b.appendChild(el("div", "tref", s.title));
    const sw = el("div", "tswatches");
    const buttons = el("div", "tbuttons");
    for (const sec of s.sections) for (const r of sec.rows) {
      if (r.kind === "custom") {
        const hex = r.options.split("|");
        const labels = r.detail.split("|");
        hex.forEach((h, j) => {
          const d = el("button", "dot" + (h ? "" : " none") + (j === r.value ? " on" : ""));
          d.type = "button";
          if (h) d.style.background = "#" + h;
          d.setAttribute("aria-label", labels[j] || "Remove");
          d.addEventListener("click", () => send(`trayact ${r.action} ${h ? j : 5}`));
          sw.appendChild(d);
        });
        continue;
      }
      const x = el("button", r.flag("t") ? "accent" : "", r.title);
      x.type = "button";
      x.disabled = r.flag("d");
      if (r.label) x.setAttribute("aria-label", r.label);
      x.addEventListener("click", () => send(`trayact ${r.action} 0`));
      buttons.appendChild(x);
    }
    b.append(sw, buttons);
    b.hidden = false;
  },
  hide() {
    this.box.hidden = true;
  },
};

// ---- the capsule (the way back), the player, toasts ----
const capsule = {
  box: null,
  timer: 0,
  init() {
    this.box = el("button", "capsule");
    this.box.type = "button";
    this.box.hidden = true;
    this.box.addEventListener("click", () => {
      this.box.hidden = true;
      send("back");
    });
    document.body.appendChild(this.box);
  },
  show(words) {
    clearTimeout(this.timer);
    if (!words) {
      this.box.hidden = true;
      return;
    }
    this.box.textContent = `‹ ${words}`;
    this.box.setAttribute("aria-label", `Go back to ${words}`);
    this.box.hidden = false;
    this.timer = setTimeout(() => (this.box.hidden = true), 12000);
  },
};

const player = {
  box: null,
  init() {
    this.box = el("div", "player");
    this.box.hidden = true;
    this.box.innerHTML = `<div class="pw"><div class="pt"></div><div class="ps"></div></div>`;
    const stop = el("button", "stop");
    stop.type = "button";
    stop.setAttribute("aria-label", "Stop Listening");
    stop.appendChild(icon("square"));
    stop.addEventListener("click", () => {
      voice.stop();
      this.hide();
      send("listenstop");
    });
    this.box.appendChild(stop);
    document.body.appendChild(this.box);
  },
  show(title, state) {
    $(".pt", this.box).textContent = title;
    $(".ps", this.box).textContent = state;
    this.box.hidden = false;
  },
  hide() {
    this.box.hidden = true;
  },
};

let toastTimer = 0;

function toast(words) {
  let t = $(".toast");
  if (!t) {
    t = el("div", "toast");
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = words;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1800);
}

// ---- Listen: the browser's voice, as core's session asks ----
const voice = {
  say(c, v, words) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(words);
    u.lang = "en-US";
    u.onstart = () => send(`spoke ${c} ${v} ${clock()}`);
    u.onend = () => send(`spoken ${c} ${v}`);
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") send(`spoken ${c} ${v}`);
    };
    speechSynthesis.speak(u);
  },
  stop() {
    window.speechSynthesis?.cancel();
  },
};

// ---- Keep Screen On ----
let lock = null;
let lockTimer = 0;

async function awake(ms) {
  clearTimeout(lockTimer);
  if (ms > 0) {
    try {
      if (!lock && navigator.wakeLock) lock = await navigator.wakeLock.request("screen");
    } catch {}
    lockTimer = setTimeout(() => {
      lock?.release();
      lock = null;
    }, ms);
  } else {
    lock?.release();
    lock = null;
  }
}

// ---- the keyboard: core's commands ----
addEventListener("keydown", (e) => {
  if (e.repeat || menuOpen) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const mods = (e.ctrlKey || e.metaKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0);
  if (typing && !(mods & 1)) return;
  if (!typing && e.target.closest?.(".panel, .tray, .menu") && !(mods & 1)) return;
  const name = { " ": "space", Enter: "return", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" }[e.key] ?? (e.key.length === 1 ? e.key.toLowerCase() : null);
  if (!name) return;
  if (name === "return" && !typing && document.activeElement !== document.body) return;
  // (Core's commands are those keys with these modifiers; the browser's
  // own are left to it otherwise.)
  if (name === "space" || ((mods & 1) && /^[lf\][,pib]$|^left$/.test(name))) e.preventDefault();
  send(`key ${name} ${mods}`);
});

// ---- the page's life ----
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => send(`dark ${e.matches ? 1 : 0}`));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") send("away");
});

// The reader's version and what is kept read: the address's place first,
// then begun.
function begin() {
  if (started) return;
  started = true;
  const c = chapterOfAddress(location.pathname);
  const v = /^\/read\/(bsb|kjv|web|asv|ylt)\//.exec(location.pathname);
  if (v) send(`version ${v[1].toUpperCase()}`);
  if (c >= 0) send(`place ${c} 0 0`);
  send(`start ${innerWidth} ${innerHeight} ${Math.round(devicePixelRatio * 100)} ${matchMedia("(prefers-color-scheme: dark)").matches ? 1 : 0} ${-new Date().getTimezoneOffset() * 60}`);
}

panel.init();
tray.init();
capsule.init();
player.init();
// (The panel's entries are the browser's Back; the reader's place is
// core's, never the browser's restoring.)
history.scrollRestoration = "manual";
history.replaceState({ sb: 0 }, "");
reader.main.textContent = "";

const sys = {
  args: ["bible"],
  env: [],
  write(fd, data) {
    (fd === 2 ? console.error : console.log)(dec.decode(data));
    return data.length;
  },
  read: () => -9,
  open: () => -2,
  close: () => -9,
};
const module = await WebAssembly.compileStreaming(window.l8Prefetch?.[WASM] || fetch(WASM));
const { instance } = await instantiate(module, sys, imports);
runResumable(instance, () => new Promise((r) => {
  if (inbox) r();
  else wakeUp = r;
})).then((status) => console.warn("smooth bible stopped", status), (e) => console.error("smooth bible failed", e));
