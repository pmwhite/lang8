// Smooth Bible on the web: the skin (SKINS.md). Core runs in WebAssembly
// (programs/bible/web/main.l8, the app and a host for the browser), and
// this draws what it says, the web's way: the reader as the page itself,
// core's screens in a panel beside it (over it, on a narrow window), the
// selection's toolbar, the browser's Back. It decides how things look and
// move; what is there and what happens are core's. They talk in lines
// (UTF-8, `\n`-ended, fields split by tabs), as Android's skin does.
import { runResumable, pausing } from "../../../../web/l8-runtime.js";
import { Reloader, watchBuilds } from "../../../../web/reload.js";
import { PLACE_SLACK, newLinks, addLinks, bottomMove, topMove, glide, GLIDE_MOST } from "./follow.js";

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

// (?debug in the address: the wire both ways in the console, and a line
// sent by hand: sbSend("...").)
const DEBUG = location.search.includes("debug");
if (DEBUG) window.sbSend = (line) => send(line);
// (And a line taken as core's, for trying the skin alone: sbSaid("...").)
if (DEBUG) window.sbSaid = (line) => said(line + "\n");

function send(line) {
  if (DEBUG) console.log("→ " + line);
  inbox += line + "\n";
  if (wakeUp) {
    const w = wakeUp;
    wakeUp = null;
    w();
  }
}

// (A version and the plans first; the language data and the Manual at low
// priority, after the reader: host ids from 12.)
const dataRead = new Set();

// (A folio is compressed already, and core decodes it; every other file is
// gzipped.)
async function fetchData(id, name) {
  try {
    const folio = name.endsWith(".folio");
    const url = folio ? `${DATA}/${name}` : `${DATA}/${name}.gz`;
    dataRead.add(url);
    const r = await fetch(url, { priority: id >= 12 ? "low" : "high" });
    if (!r.ok) throw new Error(r.status);
    const body = folio ? r.body : r.body.pipeThrough(new DecompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    files.set(id, bytes);
    send(`got ${id} ${bytes.length}`);
  } catch (e) {
    console.warn("smooth bible: no", name, e);
    send(`got ${id} -1`);
  }
}

// ---- the network: a GET for core's host (the site's Worker, /api/v1/:
// it holds the ESV's key), its answer a file core reads ----
// (On smoothbible.com the Worker answers /api/; a development server, and
// a tailnet that forwards only /read, answer /read/api/ too: serve.mjs.)
const API = location.hostname === "smoothbible.com" ? "/api/v1/" : "/read/api/v1/";

async function httpGet(id, url) {
  let status = 0;
  let bytes = new Uint8Array(0);
  try {
    const r = await fetch(url, { headers: { "X-Smooth-Bible": "web (1)" }, signal: AbortSignal.timeout(12000) });
    status = r.status;
    bytes = new Uint8Array(await r.arrayBuffer());
  } catch {}
  files.set(id, bytes);
  send(`http ${id} ${status} ${bytes.length}`);
}

// ---- what core fetches to keep (core/held.l8's recordings, core/shelf.l8's
// modules): each fetched through the site's Worker (their hosts give pages
// no access to their files) and kept in the browser's cache under
// /read/held/NAME, never fetched as such; read back for core by name ----
const HELD = "sb-held";
const heldKey = (name) => new Request(`/read/held/${encodeURIComponent(name)}`);

async function fetchHeld(id, url, name) {
  let status = 0;
  let size = 0;
  try {
    const r = await fetch(`${API}relay?u=${encodeURIComponent(url)}`, { headers: { "X-Smooth-Bible": "web (1)" } });
    status = r.status;
    if (r.ok && r.body) {
      const total = Number(r.headers.get("content-length")) || 0;
      const parts = [];
      let told = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        size += value.length;
        if (size - told >= 262144) {
          told = size;
          send(`fetching ${id} ${size} ${total}`);
        }
      }
      const type = r.headers.get("content-type") || "application/octet-stream";
      const blob = new Blob(parts, { type });
      await (await caches.open(HELD)).put(heldKey(name), new Response(blob, { headers: { "content-type": type } }));
      keepStorage("sb.held");
    }
  } catch {
    size = 0;
  }
  send(`fetched ${id} ${status} ${status === 200 ? size : 0}`);
}

// A kept file read back for core as id (`got ID SIZE`; -1: not kept): all
// of it, or count bytes from offset (as many as it has there).
async function readHeld(id, name, offset = 0, count = -1) {
  let bytes = null;
  try {
    const hit = await (await caches.open(HELD)).match(heldKey(name));
    if (hit) {
      if (count < 0 && offset === 0) bytes = new Uint8Array(await hit.arrayBuffer());
      else {
        const blob = await hit.blob();
        bytes = new Uint8Array(await blob.slice(offset, count < 0 ? blob.size : offset + count).arrayBuffer());
      }
    }
  } catch {}
  if (bytes) files.set(id, bytes);
  send(`got ${id} ${bytes ? bytes.length : -1}`);
}

// Bytes core made kept as the file named, as core's fetches are kept
// (`kept ID OK`).
async function keepHeld(id, name, data) {
  let ok = false;
  try {
    await (await caches.open(HELD)).put(heldKey(name), new Response(new Blob([data]), { headers: { "content-type": "application/octet-stream" } }));
    keepStorage("sb.held");
    ok = true;
  } catch {}
  send(`kept ${id} ${ok ? 1 : 0}`);
}

// A held recording as an address the player can seek in (none: not held).
async function heldAddress(name) {
  const hit = await (await caches.open(HELD)).match(heldKey(name));
  return hit ? URL.createObjectURL(await hit.blob()) : "";
}

// The network's kind, said as it changes (core/held.l8's NET_: 0 none, 1
// not metered, 2 metered: a phone's data, or Save-Data asked for).
let networkSaid = -1;

function tellNetwork() {
  const c = navigator.connection;
  const kind = !navigator.onLine ? 0 : c && (c.saveData || c.type === "cellular") ? 2 : 1;
  if (kind === networkSaid) return;
  networkSaid = kind;
  send(`network ${kind}`);
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
  bw_http(id, b, n) {
    httpGet(Number(id), dec.decode(this.bytes().slice(Number(b), Number(b) + Number(n))));
    return 0n;
  },
  bw_read_kept(id, name, nameN) {
    readHeld(Number(id), dec.decode(this.bytes().slice(Number(name), Number(name) + Number(nameN))));
    return 0n;
  },
  bw_read_kept_range(id, name, nameN, offset, count) {
    readHeld(Number(id), dec.decode(this.bytes().slice(Number(name), Number(name) + Number(nameN))), Number(offset), Number(count));
    return 0n;
  },
  bw_keep(id, name, nameN, data, count) {
    const bytes = this.bytes();
    // (Copied now: the memory is core's again once this returns.)
    keepHeld(Number(id), dec.decode(bytes.slice(Number(name), Number(name) + Number(nameN))), bytes.slice(Number(data), Number(data) + Number(count)));
    return 0n;
  },
  bw_fetch(id, b, n, name, nameN) {
    const bytes = this.bytes();
    fetchHeld(Number(id), dec.decode(bytes.slice(Number(b), Number(b) + Number(n))), dec.decode(bytes.slice(Number(name), Number(name) + Number(nameN))));
    return 0n;
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
      keepStorage(key);
    } catch (e) {
      console.warn("smooth bible: not kept", key, e);
    }
    return 0n;
  },
  bw_store_remove(b, start, end) {
    const name = dec.decode(this.bytes().slice(Number(b) + Number(start), Number(b) + Number(end)));
    localStorage.removeItem("sb." + name);
    // (A held recording is a kept file too.)
    caches.open(HELD).then((c) => c.delete(heldKey(name))).catch(() => {});
    return 0n;
  },
};

// ---- the look (core's look line) ----
const look = { size: 1, spacing: 1.32, margin: 28, dark: false, red: false, accent: "#9C3A2C", rule: "#1E1C19", gloss: 0.32 };

// The reader's faces (web/main.l8's sk_fonts, in its order).
const FONTS = [
  `"Source Serif 4", "Charis SIL", Georgia, serif`,
  `"Charis SIL", "Source Serif 4", Georgia, serif`,
  `Georgia, "Source Serif 4", serif`,
  `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
];

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
  s.setProperty("--body", FONTS[w.num(13)] || FONTS[0]);
  s.setProperty("--column", (w.num(20) || 34000) / 1000 + "em");
  s.background = c(6);
  look.accent = c(10);
  document.documentElement.classList.toggle("dark", look.dark);
  document.documentElement.classList.toggle("red", look.red);
  $('meta[name="theme-color"]').content = c(6);
}

// What a screen reader says of an accessory (core's accessory NAME WORDS).
const accessories = new Map();

// The credits core says (credit K WORDS LINK ADDRESS LABEL), by K.
const credits = new Map();

// The highlights' washes now, by the color a mark line names each with
// (core's highlights line: SWATCH WASH STRENGTH...).
const washes = new Map();

function readHighlights(w) {
  washes.clear();
  for (let i = 1; w.word(i + 2) !== ""; i += 3) washes.set(w.word(i), hexAlpha(w.word(i + 1), w.num(i + 2) / 1000));
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
    // (A symbol: its words its name, drawn.)
    if (st === 115 || st === 116) {
      const g = symbol(text.slice(a, b), `sym${st === 116 ? " bold" : ""}`);
      if (g) node.appendChild(g);
      continue;
    }
    const link = links.find((l) => l[0] <= a && a < l[1]);
    const s = el(link ? "a" : "span", st >= 0 ? runClass(st) : "", text.slice(a, b));
    // (Where its words begin in text, UTF-16: a reveal finds them by it.)
    s.dataset.at = a;
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
    caps: w.field(38).trim().split(" ").filter(Boolean).map(Number),
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
// A chapter's link map being read (`link C MODE`, its `match` lines).
let linkBlock = null;

// core/skin.l8's CUSTOM_HIT (a verse found), CUSTOM_SWATCHES and
// CUSTOM_CARD (a card of verses to share).
const CUSTOM_HIT = 5;
const CUSTOM_SWATCHES = 6;
const CUSTOM_FONT = 4;
const CUSTOM_CARD = 11;
// (Something coming, a book's recordings: its value is its progress in
// thousandths, drawn as a bar at its end.)
const CUSTOM_DOWNLOAD = 7;

// Go To (core/skin.l8's SCR_GOTO), aimed at the panel by its argument
// (core/documents.l8's GOTO_PANEL; else at the page).
const SCR_GOTO = 1;
const GOTO_PANEL = 1;

// A wide window's least width (read.css's min-width: 1000px): the panel
// at the page's right, Go To a popover hanging from its opener, POPOVER_GAP
// below it and at least POPOVER_MARGIN inside the window.
const WIDE_PX = 1000;
const POPOVER_GAP = 6;
const POPOVER_MARGIN = 12;

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
      // (Mode 4: the row's words FROM to TO, UTF-16, kept in sight.)
      if (s.focusMode === 4) s.focusWords = [w.num(3), w.num(4)];
      break;
    case "subtitle":
      s.subtitle = w.field(1);
      break;
    case "intro":
      Object.assign(s, { intro: w.field(1), introRuns: parseRuns(w.field(2)), introQuote: w.fnum(3) === 1 });
      break;
    case "left":
      Object.assign(s, { leftAction: w.fnum(1), left: w.field(2), leftIcon: w.field(3) });
      break;
    case "hero":
      Object.assign(s, { hero: w.field(1), heroScript: w.fnum(2), heroSub: w.field(3), heroLine: w.field(4), heroRuns: parseRuns(w.field(5)), heroLarge: w.fnum(6) === 1 });
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
    case "keys":
      s.keys = w.num(1);
      break;
    case "page":
      s.page = true;
      break;
    case "reader":
      s.reader = { linked: w.num(1) === 1 };
      linked = s.reader.linked;
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
    id: w.num(1), kind: w.num(2), arg: w.num(3), group: w.num(4), title: w.field(1), search: w.field(2), sections: [], tools: [],
    commands: [], focus: -1, focusMode: 0, focusWords: null, segments: [], filterColors: [], sorts: [], scopes: [], searchText: "",
    intro: "", subtitle: "", hero: "", left: "", confirm: "", button: "", emptyTitle: "", emptyLine: "",
  };
}

// ---- what core said ----
function said(text) {
  if (DEBUG) console.log("← " + text.replace(/\n/g, " ⏎ "));
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
  if (linkBlock) {
    if (word === "match") {
      linkBlock.i0.push(w.num(1));
      linkBlock.i1.push(w.num(2));
      linkBlock.j.push(w.num(3));
    } else if (word === "end") {
      linkMaps.set(linkBlock.c, linkBlock);
      linkBlock = null;
    }
    return;
  }
  if (chapter) {
    if (word === "end") {
      chapter.into?.part(chapter.c, chapter.k, chapter.n, chapter.text, chapter.lines);
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
    case "part":
      chapter = { c: w.num(2), k: w.num(3), n: w.num(4), text: w.field(1), lines: [], into: panes[w.num(1)] };
      break;
    case "go":
      panes[w.num(1)]?.go(w.num(2), w.num(3), w.num(4), w.num(5));
      break;
    case "link":
      // (By comment: which pane the commentary is in; the panel, if unsaid.)
      linkBlock = { c: w.num(1), mode: w.num(2), comments: w.num(3) === 0 ? 0 : 1, i0: [], i1: [], j: [] };
      break;
    case "halt":
      panes[w.num(1)]?.halt();
      break;
    case "forget":
      panes[w.num(1)]?.forget(w.num(2));
      if (w.num(2) < 0) linkMaps.clear();
      break;
    case "line":
      if (panes[w.num(1)]) panes[w.num(1)].line = w.num(2) / 1000;
      break;
    case "present":
      panel.present(w.num(1));
      break;
    case "push":
    case "present_over":
      panel.push(w.num(1));
      break;
    case "panel":
      panel.besideFirst(w.num(1));
      break;
    case "beside":
      panel.besideLine(w.num(1) === 1, w.num(2) === 1);
      break;
    case "focus":
      panel.refocus(w.num(1));
      break;
    case "update":
    case "refill":
      panel.update(w.num(1));
      break;
    case "reveal":
      panel.reveal(w.num(1));
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
    case "highlights":
      readHighlights(w);
      break;
    case "accessory":
      accessories.set(w.word(1), w.field(1));
      break;
    case "credit":
      credits.set(w.num(1), { words: w.field(1), link: w.field(2), address: w.field(3), label: w.field(4) });
      break;
    case "look":
      readLook(w);
      break;
    case "reader":
      for (const r of panes) r.setCount(w.num(1));
      break;
    case "goto":
      send("jumped 0");
      panel.dismiss();
      break;
    case "page":
      reader.page(w.num(1) === 1 ? 1 : -1);
      break;
    case "follow":
      reader.follow(w.num(1), w.num(2));
      break;
    case "hearing":
      reader.hearing(w.num(1), w.num(2));
      break;
    case "wake":
      reader.wake(w.num(1));
      break;
    case "next":
      // (A turn core asked for: its work goes on a step at a time, the
      // page drawn and answering between steps.)
      setTimeout(() => send("next"), 0);
      break;
    case "title":
      bar.title(w.field(1));
      break;
    case "version":
      bar.version(w.field(1));
      break;
    case "carried":
      bar.carried(w.word(1), w.field(1));
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
    case "share_image":
      shareCard(w.field(1));
      break;
    case "share":
      if (navigator.share) navigator.share({ text: w.field(1) }).catch(() => {});
      else navigator.clipboard?.writeText(w.field(1)).then(() => toast("Copied"), () => {});
      break;
    case "toast":
      toast(w.field(1));
      break;
    case "arriving":
      arrival.show(w.num(1), w.num(2));
      break;
    case "arrived":
      arrival.done(w.num(1));
      break;
    case "announce":
      announce(w.field(1));
      break;
    case "savefile": {
      // (A file to save: downloaded, as a page saves one.)
      const a = el("a");
      a.href = URL.createObjectURL(new Blob([w.field(2)], { type: "text/plain;charset=utf-8" }));
      a.download = w.field(1);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      break;
    }
    case "memorized":
      toast("Added to Memory");
      break;
    case "back":
      capsule.show(w.field(1), w.field(2), w.num(1));
      break;
    case "say":
      voice.say(w.num(1), w.num(2), w.num(3) / 1000 || 1, w.field(1), w.field(2));
      break;
    case "player":
      player.show(w.field(1), w.field(2), w.field(3) !== "0", w.field(4), w.field(5), w.field(6), w.field(7));
      break;
    case "audio_play":
      sound.play(w.num(1), w.num(3), w.num(4), w.num(5) / 1000 || 1, w.field(1));
      break;
    case "audio_stop":
      sound.stop();
      break;
    case "timer": {
      // (core's timer: told when it is up.)
      const tok = w.num(1);
      setTimeout(() => send(`timer ${tok}`), Math.max(0, w.num(2)));
      break;
    }
    case "speech_stop":
      voice.stop();
      break;
    case "listen_pause":
      sound.pause();
      voice.pause();
      break;
    case "listen_resume":
      sound.resume();
      voice.resume();
      break;
    case "listen_stop":
      voice.stop();
      sound.stop();
      player.hide();
      break;
    case "notify_ask": {
      // (Notifications asked for; the answer core's.)
      const who = w.num(1);
      if (!window.Notification) send(`notifyok ${who} 0`);
      else Notification.requestPermission().then((p) => send(`notifyok ${who} ${p === "granted" ? 1 : 0}`));
      break;
    }
    case "notify_clear":
      reminders.clear();
      break;
    case "notify":
      reminders.add(Number(w.word(1)), `${w.num(2)} ${w.num(3)}`, w.field(1), w.field(2));
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
    document.title = `${t} · Smooth Bible`;
    this.label();
  },
  // The title's label: the chapter, the version, what a tap does.
  label() {
    const t = $(".t", this.titleButton).textContent;
    this.titleButton.setAttribute("aria-label", this.versionWord ? `${t}, ${this.versionWord}, Go To` : `${t}, Go To`);
  },
  // The ribbon carried: a strip of its color before the title.
  carried(hex, words) {
    let m = $(".bar .ribbon");
    if (!m) {
      m = el("span", "ribbon");
      m.setAttribute("role", "img");
      this.titleButton.prepend(m);
    }
    m.hidden = hex === "-";
    if (hex !== "-") {
      m.style.background = "#" + hex;
      m.setAttribute("aria-label", words);
      m.title = words;
    }
  },
  // The version, faint after the title, as the iPhone's title has it.
  version(v) {
    this.versionWord = v;
    $(".v", this.titleButton).textContent = v;
    this.label();
    if (reader.said.c >= 0) address(reader.said.c);
  },
};

// ---- a document arriving for a pane (SKINS.md, Arriving) ----
// The only progress shown: a hairline along the bottom edge of the pane's
// bar (the page's top bar, the panel's row), filled from the leading edge
// to the thousandths come; faded out over ARRIVAL_FADE_MS once nothing is
// on its way (gone at once where motion is reduced).
const ARRIVAL_FADE_MS = 200;
const arrival = {
  // Pane p's hairline (read.css's .arrival), or null.
  line(p) {
    if (p === 0) return $(".bar .arrival");
    return p === 1 ? $(".pbar .arrival", panel.besideBox) : null;
  },
  show(p, thousandths) {
    const a = this.line(p);
    if (!a) return;
    for (const fading of a.getAnimations()) if (fading.id === "arrived") fading.cancel();
    a.hidden = false;
    a.style.transform = `scaleX(${Math.max(0, Math.min(1000, thousandths)) / 1000})`;
  },
  done(p) {
    const a = this.line(p);
    if (!a || a.hidden) return;
    const gone = () => {
      a.hidden = true;
      a.style.transform = "";
    };
    if (reducedMotion()) return gone();
    const fade = a.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ARRIVAL_FADE_MS, easing: "ease-out", id: "arrived" });
    fade.onfinish = gone;
  },
};

bar.titleButton.addEventListener("click", () => send("tap goto"));
bar.titleButton.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  menuWanted = true;
  send("titlemenu");
});
$(".bar .library").addEventListener("click", () => send("tap library"));
$(".bar .shelf").addEventListener("click", () => send("tap shelf"));
$(".bar .search").addEventListener("click", () => send("tap search"));
$(".bar .aa").addEventListener("click", () => send("tap settings"));

// ---- the panes ----
// The page (pane 0) and the panel's reader (pane 1) are read the same way
// (SKINS.md, Panes): a window of a document's parts in the document's
// flow, each asked of core as it comes near (`want P C K`) and laid out by
// the browser. Where each is read is told to core in places (`at P C I
// FRAC`: a chapter, an anchor, how far through its span); core says where a
// jump takes either (`go`), and which of the page's anchors go with which
// of the panel's (`link`). Linked, the pane a finger last moved leads, and
// the other is moved here each frame by the link map (follow.js, the same
// rules as core/follow.l8's).
const barHeight = () => $(".bar").getBoundingClientRect().bottom;
const emPx = () => parseFloat(getComputedStyle($("#reader")).fontSize) || 19;

// The window: how far beyond the screen parts are kept laid out (screens
// either way), and how far before they go.
const AHEAD_SCREENS = 2;
const FAR_SCREENS = 6;

// A glide (`go` brought, a comment's step) only within this many screens;
// farther, at once.
const GLIDE_SCREENS = 1.5;

// Each chapter's link map, as core said it (`link C MODE`).
const linkMaps = new Map();

// Whether the panel's reader is linked with the page (its screen's
// `reader` line), and which pane a finger last moved.
let linked = false;
let leader = 0;

// A reader: pane p's parts in main, scrolled in view (the window, for the
// page; the panel's list, for its reader); opts.tap: its verses tapped
// select them; opts.address: its chapter kept in the address.
function makeReader(p, main, view, opts) {
  return {
  p,
  main,
  view,
  opts,
  count: 0,
  // Its reading line, the fraction of the way down what is in sight.
  line: p === 0 ? 0.333 : 0,
  // Each chapter's parts as core said them: their count, anchors ([verse,
  // part]) and, for a run of chapters without comments, the run.
  chapters: new Map(),
  asked: new Set(),
  // Every part measured since its document came, and how many bytes it is
  // (guessParts).
  measured: new Map(),
  // Parts measured ahead, out of sight ("c:k" to the width they were
  // measured at, their height and where each anchor begins in them), and
  // the one asked for to be (aheadNext).
  ahead: new Map(),
  aheadAsked: null,
  aheadAskedAt: 0,
  // A `go` waiting for its part.
  pending: null,
  said: { c: -1 },
  told: null,
  selC: -1,
  sel: new Set(),
  // Scrolls of its own under way (not a finger's), and whether a finger is
  // on it, or has just let it glide.
  self: 0,
  finger: false,
  gliding: false,
  moving: false,
  frame: 0,
  restTimer: 0,
  wakeTimer: 0,
  wheelTimer: 0,

  setCount(n) {
    this.count = n;
  },

  // The reading line, in the viewport; and down the pane's content.
  lineY() {
    const top = this.view.inset();
    return top + this.line * (this.view.bottom() - top);
  },

  contentY(viewportY) {
    return this.view.top() + viewportY - this.view.origin();
  },

  // ---- parts ----
  key: (c, k) => `${c}:${k}`,

  sections() {
    return this.main.children;
  },

  findPart(c, k) {
    for (const s of this.sections()) if (+s.dataset.c === c && s.dataset.k === String(k)) return s;
    return null;
  },

  // A part's place held, its words asked for (k "last": the chapter's last
  // part, whatever it is).
  placeholder(c, k) {
    const s = el("section", "part wait");
    s.dataset.c = c;
    s.dataset.k = k;
    s.style.minHeight = `${this.view.height()}px`;
    return s;
  },

  want(c, k) {
    if (c < 0 || c >= this.count) return;
    const key = this.key(c, k);
    if (this.asked.has(key)) return;
    this.asked.add(key);
    send(`want ${this.p} ${c} ${k === "last" ? 999999 : k}`);
  },

  // The part after part k of chapter c, and the one before ([c, k]; k
  // "last" for a chapter whose count isn't known; null: none).
  after(c, k) {
    const info = this.chapters.get(c);
    if (!info) return null;
    const end = info.gap ? info.gap[1] : c;
    if (!info.gap && k + 1 < info.n) return [c, k + 1];
    return end + 1 < this.count ? [end + 1, 0] : null;
  },

  before(c, k) {
    if (k > 0) return [c, k - 1];
    if (c <= 0) return null;
    const info = this.chapters.get(c - 1);
    if (!info) return [c - 1, "last"];
    if (info.gap) return [info.gap[0], 0];
    return [c - 1, Math.max(0, info.n - 1)];
  },

  // Part k of chapter c's lines (`part P C K N`): kept as what core knows
  // of the chapter, and shown where its place is held.
  part(c, k, n, text, lines) {
    const spans = [];
    const verses = [];
    const links = [];
    const marks = new Map();
    const anchors = [];
    // (How many bytes each of the chapter's parts is: following guesses
    // where those not laid out would be by them.)
    const sizes = [];
    let gap = null;
    let coming = false;
    for (const w of lines) {
      const x = w.word(0);
      if (x === "span") spans.push([w.num(1), w.num(2), w.num(3), w.num(4)]);
      else if (x === "verse") verses.push([w.num(1), w.num(2), w.num(3)]);
      else if (x === "link") links.push([w.num(1), w.num(2), w.num(3), Number(w.word(4))]);
      else if (x === "mark") marks.set(w.num(1), { hex: w.word(2), bm: w.num(3) === 1, note: w.num(4) === 1 });
      else if (x === "anchor") anchors.push([w.num(1), w.num(2), w.num(3)]);
      else if (x === "sizes") for (let i = 1; w.word(i) !== ""; i++) sizes.push(w.num(i));
      else if (x === "gap") gap = [w.num(1), w.num(2)];
      else if (x === "coming") coming = true;
    }
    if (n > 0) this.chapters.set(c, { n, anchors, gap, sizes });
    if (gap) for (let x = gap[0]; x <= gap[1]; x++) if (x !== c) this.chapters.set(x, { n: 1, anchors: [], gap });
    // (Its place: held for it, or for its chapter's last part, or for a
    // chapter of its run.)
    let s = this.findPart(c, k);
    if (!s) {
      for (const t of this.sections()) {
        const tc = +t.dataset.c;
        if (t.dataset.k === "last" && (tc === c || (gap && tc >= gap[0] && tc <= gap[1]))) s = t;
        else if (gap && t.dataset.k === "0" && tc >= gap[0] && tc <= gap[1]) s = t;
        if (s) break;
      }
    }
    this.asked.delete(this.key(c, k));
    if (!s) {
      // (Asked for to be measured ahead: measured out of sight.)
      if (this.aheadAsked === this.key(c, k)) {
        this.aheadAsked = null;
        if (!coming && !gap) this.measureAhead(c, k, layChapter(text, spans, verses, links, marks));
        followAheadSoon();
      }
      if (this.pending) this.finishPending();
      return;
    }
    const laid = layChapter(text, spans, verses, links, marks);
    const above = s.getBoundingClientRect().bottom <= this.lineY();
    const put = () => {
      s.replaceChildren(laid.frag);
      s.dataset.c = c;
      s.dataset.k = k;
      s.classList.toggle("k0", k === 0);
      s.classList.toggle("wait", coming);
      s.style.minHeight = gap ? `${this.view.height()}px` : "";
      s.links = links;
      s.anchorEls = laid.anchors;
      s.laid = true;
    };
    if (above) this.keepPlace(put);
    else put();
    if (this.settle) {
      this.settleNow();
      this.tell(true);
    }
    if (c === this.selC) this.paintSelection();
    if (this.heard && this.heard.c === c) this.paintHeard();
    if (this.pending) this.finishPending();
    else this.extend();
    // (Sent where the rule puts it: placed again by what has come.)
    if (followRuled && linked) followSoon();
  },

  // `forget P C`: its parts of chapter c (-1: all) asked for again, those
  // shown kept until they come.
  forget(c) {
    this.ahead.clear();
    if (c < 0) {
      this.chapters.clear();
      this.measured.clear();
    }
    for (const s of [...this.sections()]) {
      const sc = +s.dataset.c;
      if (c >= 0 && sc !== c) continue;
      this.asked.delete(this.key(sc, s.dataset.k));
      this.want(sc, s.dataset.k === "last" ? "last" : +s.dataset.k);
    }
  },

  // ---- the window ----
  // Parts put in while either end is near (one above the reading line put
  // in without moving what is read); those far away let go.
  extend() {
    if (!this.main.isConnected) return;
    const seen = this.view.height();
    for (let guard = 0; guard < 8; guard++) {
      const last = this.main.lastElementChild;
      if (!last || !last.laid) break;
      if (last.getBoundingClientRect().bottom - this.view.bottom() > seen * AHEAD_SCREENS) break;
      const next = this.after(+last.dataset.c, +last.dataset.k);
      if (!next) break;
      this.main.appendChild(this.placeholder(next[0], next[1]));
      this.want(next[0], next[1]);
    }
    // (Above, not while it glides by itself: the browser's glide goes on
    // to where it was aimed, and a part put in or let go above would move
    // that place under it.)
    for (let guard = 0; guard < 8 && !this.ownGlide; guard++) {
      const first = this.main.firstElementChild;
      if (!first || !first.laid) break;
      if (this.view.inset() - first.getBoundingClientRect().top > seen * AHEAD_SCREENS) break;
      const prev = this.before(+first.dataset.c, +first.dataset.k);
      if (!prev) break;
      this.keepPlace(() => this.main.insertBefore(this.placeholder(prev[0], prev[1]), first));
      this.want(prev[0], prev[1]);
    }
    const far = seen * FAR_SCREENS;
    while (this.main.children.length > 1 && this.main.lastElementChild.getBoundingClientRect().top - this.view.bottom() > far) this.main.lastElementChild.remove();
    while (!this.ownGlide && this.main.children.length > 1 && this.view.inset() - this.main.firstElementChild.getBoundingClientRect().bottom > far) {
      const gone = this.main.firstElementChild;
      this.keepPlace(() => gone.remove());
    }
  },

  // A change above the reading line made without moving what is read (the
  // browser's own scroll anchoring may have kept it already: then nothing
  // is left to do).
  keepPlace(change) {
    const y = this.lineY();
    let hold = null;
    for (const s of this.sections()) if (s.getBoundingClientRect().bottom > y) { hold = s; break; }
    const before = hold ? hold.getBoundingClientRect().top : 0;
    change();
    if (hold && hold.isConnected) {
      const d = hold.getBoundingClientRect().top - before;
      if (Math.abs(d) > 0.5) this.scrollBy(d);
    }
  },

  scrollBy(d) {
    this.self++;
    this.view.scrollTo(this.view.top() + d);
    requestAnimationFrame(() => this.self--);
  },

  // The pane's width changed: what was at the reading line kept there, as
  // far through its part as it was.
  resized() {
    this.fitHeld();
    const spot = this.spot;
    if (spot && spot.s.isConnected) {
      const r = spot.s.getBoundingClientRect();
      this.scrollBy(r.top + spot.frac * r.height - this.lineY());
    }
    this.extend();
    this.tell(true);
  },

  // The part at the reading line as last found, and how far through it.
  spot: null,

  // The parts that only hold a place (a part still to come, a run of
  // chapters without comments) as tall as the pane is now (SKINS.md).
  fitHeld() {
    const h = `${this.view.height()}px`;
    for (const s of this.sections()) if (s.style.minHeight) s.style.minHeight = h;
  },

  // Its words laid out again at another size (the panel filling the window
  // or back beside the page): the place it told last (at rest, where it
  // is) put back at its reading line, held there as a `go` is. (Not from
  // how far down it was scrolled: that moves with every line above it.)
  relaid() {
    this.fitHeld();
    const t = this.told;
    if (this.pending || !t) this.resized();
    else this.go(t.c, t.i, t.f, 0);
  },

  // ---- places ----
  // Chapter c's shape as it is laid out (follow.js's): each anchor's start
  // down the pane's content (null: not laid out), the chapter's top and end.
  shape(c) {
    const info = this.chapters.get(c);
    const n = info ? info.anchors.length : 0;
    const starts = new Array(n).fill(null);
    let top = null;
    let end = null;
    if (info) {
      for (const s of this.sections()) {
        if (!s.laid || +s.dataset.c !== c) continue;
        const k = +s.dataset.k;
        const r = s.getBoundingClientRect();
        if (k === 0) top = this.contentY(r.top);
        if (info.gap || k + 1 >= info.n) end = this.contentY(r.bottom);
        const first = this.firstAnchor(info, k);
        (s.anchorEls || []).forEach((a, j) => {
          if (a && first + j < n) starts[first + j] = this.contentY(a.getBoundingClientRect().top);
        });
      }
    }
    return { starts, top, end, em: emPx() };
  },

  // Every part of chapters fromC to toC not laid out, where it would begin
  // and how tall it would be: as tall for its length as the laid-out parts
  // are on average (core's `sizes`, each part's bytes; a chapter's not told
  // yet, their mean height), the parts between it and what is laid out
  // counted too, however many (a commentary's chapter may be hundreds; at
  // most GUESS_WALK_MOST walked each way). Following goes by anchors not
  // laid out yet as well (follow.js; how far a guess was out is closed as
  // the leader moves).
  guessParts(fromC, toC) {
    const laid = [...this.sections()].filter((s) => s.laid);
    const guess = { parts: [], mean: this.view.height(), perByte: 0 };
    if (!laid.length) return guess;
    const bytesOf = (c, k) => this.chapters.get(c)?.sizes?.[k] || 0;
    const plain = laid.filter((s) => !s.style.minHeight);
    if (plain.length) guess.mean = plain.reduce((t, s) => t + s.getBoundingClientRect().height, 0) / plain.length;
    // (How tall a byte is, over every part of the document measured so
    // far, not only those laid out now: a few parts' say varies.)
    for (const s of plain) {
      const b = bytesOf(+s.dataset.c, +s.dataset.k);
      if (b > 0) this.measured.set(`${s.dataset.c}:${s.dataset.k}`, [s.getBoundingClientRect().height, b]);
    }
    let sized = 0;
    let bytes = 0;
    for (const [h, b] of this.measured.values()) {
      sized += h;
      bytes += b;
    }
    if (bytes > 0) guess.perByte = sized / bytes;
    const width = plain.length ? plain[0].getBoundingClientRect().width : 0;
    guess.width = width;
    const height = (c, k) => {
      const known = this.aheadAt(c, k, width);
      if (known) return known.h;
      return bytesOf(c, k) > 0 && guess.perByte > 0 ? bytesOf(c, k) * guess.perByte : guess.mean;
    };
    let [c, k] = [+laid[laid.length - 1].dataset.c, +laid[laid.length - 1].dataset.k];
    let y = this.contentY(laid[laid.length - 1].getBoundingClientRect().bottom);
    for (let n = 0; n < GUESS_WALK_MOST; n++) {
      const next = this.after(c, k);
      if (!next || next[1] === "last" || next[0] > toC) break;
      [c, k] = next;
      const h = height(c, k);
      if (c >= fromC) guess.parts.push({ c, k, y, h });
      y += h;
    }
    [c, k] = [+laid[0].dataset.c, +laid[0].dataset.k];
    y = this.contentY(laid[0].getBoundingClientRect().top);
    for (let n = 0; n < GUESS_WALK_MOST; n++) {
      const prev = this.before(c, k);
      if (!prev || prev[1] === "last") break;
      const gap = this.chapters.get(prev[0])?.gap;
      if ((gap ? gap[1] : prev[0]) < fromC) break;
      [c, k] = prev;
      const h = height(c, k);
      y -= h;
      if (c <= toC) guess.parts.push({ c, k, y, h });
    }
    return guess;
  },

  // Chapter c's shape as following takes it: anchors not laid out where
  // they would be by guess (their bytes into their part, or spread through
  // it), its top and end too (not a run of chapters without comments: one
  // part, there or not).
  shapeGuessed(c, guess) {
    const sh = this.shape(c);
    const info = this.chapters.get(c);
    if (!info || info.gap) return sh;
    // (Each part's first anchor, at once: a long chapter has many.)
    const firstOf = new Array(info.n + 1).fill(info.anchors.length);
    for (let i = info.anchors.length - 1; i >= 0; i--) firstOf[Math.min(info.anchors[i][1], info.n)] = i;
    for (let k = info.n - 1; k >= 0; k--) firstOf[k] = Math.min(firstOf[k], firstOf[k + 1]);
    for (const g of guess.parts) {
      if (g.c !== c) continue;
      if (g.k === 0 && sh.top == null) sh.top = g.y;
      if (g.k + 1 >= info.n && sh.end == null) sh.end = g.y + g.h;
      const bytes = info.sizes?.[g.k] || 0;
      const first = firstOf[Math.min(g.k, info.n)];
      const last = firstOf[Math.min(g.k + 1, info.n)];
      const known = this.aheadAt(c, g.k, guess.width);
      for (let i = first; i < last; i++) {
        if (sh.starts[i] != null) continue;
        if (known && i - first < known.ys.length) {
          sh.starts[i] = g.y + known.ys[i - first];
          continue;
        }
        const into = bytes > 0 ? Math.min(1, (info.anchors[i][2] || 0) / bytes) : (i - first) / (last - first);
        sh.starts[i] = g.y + g.h * into;
      }
    }
    return sh;
  },

  // ---- parts measured ahead ----
  // While the panes rest, the parts of the chapters following goes by that
  // aren't in the window are measured out of sight, nearest first
  // (followAhead), so that a flick finds them known, not guessed: laid out
  // in a section put after the window's, hidden and out of the flow, and
  // taken away again at once. Nothing shown moves; only guesses change.
  aheadAt(c, k, width) {
    const known = this.ahead.get(`${c}:${k}`);
    return known && Math.abs(known.w - width) < 0.5 ? known : null;
  },

  measureAhead(c, k, laid) {
    const like = [...this.sections()].find((s) => s.laid && !s.style.minHeight);
    if (!like) return;
    const r = like.getBoundingClientRect();
    const s = el("section", "part");
    s.classList.toggle("k0", k === 0);
    s.style.cssText = `position: absolute; visibility: hidden; left: ${like.offsetLeft}px; top: 0; width: ${r.width}px;`;
    s.replaceChildren(laid.frag);
    this.main.appendChild(s);
    const top = s.getBoundingClientRect().top;
    const ys = laid.anchors.map((a) => (a ? a.getBoundingClientRect().top - top : 0));
    this.ahead.set(`${c}:${k}`, { w: r.width, h: s.getBoundingClientRect().height, ys });
    s.remove();
  },

  // The nearest part of chapters fromC to toC not in the window nor
  // measured asked for, to be measured as it comes (each way from the
  // window's ends in turn); whether one was.
  aheadNext(fromC, toC) {
    // (One asked for at a time; one not come in two seconds let go.)
    if (this.aheadAsked && clock() - this.aheadAskedAt < 2000) return true;
    this.aheadAsked = null;
    const laid = [...this.sections()].filter((s) => s.laid);
    if (!laid.length) return false;
    const width = laid[0].getBoundingClientRect().width;
    const wanted = (c, k) => {
      if (this.chapters.get(c)?.gap || this.findPart(c, k) || this.aheadAt(c, k, width) || this.asked.has(this.key(c, k))) return false;
      this.aheadAsked = this.key(c, k);
      this.aheadAskedAt = clock();
      this.want(c, k);
      return true;
    };
    let on = [+laid[laid.length - 1].dataset.c, +laid[laid.length - 1].dataset.k];
    let back = [+laid[0].dataset.c, +laid[0].dataset.k];
    for (let n = 0; n < GUESS_WALK_MOST && (on || back); n++) {
      if (on) {
        const next = this.after(on[0], on[1]);
        on = next && next[1] !== "last" && next[0] <= toC ? next : null;
        if (on && on[0] >= fromC && wanted(on[0], on[1])) return true;
      }
      if (back) {
        const prev = this.before(back[0], back[1]);
        const gap = prev && this.chapters.get(prev[0])?.gap;
        back = prev && prev[1] !== "last" && (gap ? gap[1] : prev[0]) >= fromC ? prev : null;
        if (back && back[0] <= toC && wanted(back[0], back[1])) return true;
      }
    }
    return false;
  },

  // A position down the content kept as the laid-out part it is in and how
  // far below that part's top (null: none laid out), and back: so that
  // parts coming and going above leave it the same place.
  spotOf(y) {
    let best = null;
    for (const s of this.sections()) {
      if (!s.laid) continue;
      const top = this.contentY(s.getBoundingClientRect().top);
      if (!best || top <= y) best = { s, dy: y - top };
      if (top > y) break;
    }
    return best;
  },

  spotY(spot) {
    return spot && spot.s.isConnected && spot.s.laid ? this.contentY(spot.s.getBoundingClientRect().top) + spot.dy : null;
  },

  // The chapter of the part at viewport y (-1: none laid out there).
  chapterAt(y) {
    for (const s of this.sections()) {
      if (!s.laid) continue;
      const r = s.getBoundingClientRect();
      if (r.bottom > y) return r.top <= y ? +s.dataset.c : -1;
    }
    return -1;
  },

  // The index of chapter info's first anchor in part k.
  firstAnchor(info, k) {
    let i = 0;
    while (i < info.anchors.length && info.anchors[i][1] < k) i++;
    return i;
  },

  // The place at the reading line: its chapter, the anchor whose span holds
  // it (-1 above the first), how far through (thousandths), and the line
  // down the content (null: not laid out there). By follow.js's linePlace
  // rule: a part or an anchor beginning within PLACE_SLACK below the line
  // is the one the line is at, so that a pane sent to a chapter's top (its
  // first part's top at the reading line) tells that chapter, never the
  // one before it, whatever the scroll's rounding.
  placeAt() {
    const y = this.lineY();
    for (const s of this.sections()) {
      const r = s.getBoundingClientRect();
      const next = s.nextElementSibling;
      if (r.bottom <= y || (r.bottom <= y + PLACE_SLACK && next && next.laid)) continue;
      if (!s.laid || r.top > y + PLACE_SLACK) return null;
      this.spot = { s, frac: Math.max(0, y - r.top) / Math.max(1, r.height) };
      const c = +s.dataset.c;
      const line = this.contentY(y);
      const sh = this.shape(c);
      let i = -1;
      for (let x = 0; x < sh.starts.length; x++) if (sh.starts[x] != null && sh.starts[x] <= line + PLACE_SLACK) i = x;
      const a = i < 0 ? (sh.top ?? this.contentY(r.top)) : sh.starts[i];
      let b = i + 1 < sh.starts.length ? sh.starts[i + 1] : sh.end;
      if (b == null) b = this.contentY(r.bottom);
      const frac = b - a < 1 ? 0 : Math.trunc(((line - a) / (b - a)) * 1000 + 0.5);
      return { c, i, frac: Math.max(0, Math.min(999, frac)), line };
    }
    return null;
  },

  // `at P C I FRAC`, as its anchor changes (or always, at rest).
  tell(always) {
    if (this.pending) return;
    const at = this.placeAt();
    if (!at) return;
    const frac = at.frac;
    const t = this.told;
    if (!always && t && t.c === at.c && t.i === at.i) return;
    this.told = { c: at.c, i: at.i, f: frac };
    send(`at ${this.p} ${at.c} ${at.i} ${frac}`);
    if (at.c !== this.said.c) {
      this.said = { c: at.c };
      if (this.opts.address) address(at.c);
    }
  },

  // ---- going somewhere ----
  // `go P C I FRAC MODE`: anchor i of chapter c (-1: its top) frac
  // thousandths through its span at the reading line (the chapter's top at
  // the top of what is in sight); its part brought in first. Brought
  // (MODE 1): a glide if it is near. Ruled (MODE 2, the panel's): then
  // where the rule puts it (followJumped).
  go(c, i, f, mode) {
    if (c < 0 || c >= this.count) return;
    this.settle = null;
    this.stopGlide();
    // (A jump: both panes held where it puts them: followJumped.)
    followJumped(this.p, mode);
    this.pending = { c, i, f, mode };
    this.finishPending();
  },

  finishPending() {
    const j = this.pending;
    if (!j || !this.main.isConnected) return;
    const info = this.chapters.get(j.c);
    if (!info) {
      this.restart(j.c, 0);
      return;
    }
    const c = info.gap ? info.gap[0] : j.c;
    const k = info.gap || j.i < 0 ? 0 : (info.anchors[j.i] ?? [0, 0])[1];
    const s = this.findPart(c, k);
    if (!s) {
      this.restart(c, k);
      return;
    }
    if (!s.laid) return;
    this.pending = null;
    const d = this.distanceTo(c, s, info.gap ? -1 : j.i, j.f);
    if (j.mode === 1 && !reducedMotion() && Math.abs(d) < this.view.height() * GLIDE_SCREENS) this.selfGlide(this.view.top() + d);
    else {
      // (Held there as parts come in above it, until a hand moves it: the
      // window may not yet reach far enough above to scroll there.)
      this.settle = { c, s, i: info.gap ? -1 : j.i, f: j.f };
      this.scrollBy(d);
      this.extend();
    }
    requestAnimationFrame(() => {
      this.tell(true);
      this.rested();
      if (followRuled) follow(panes[0]);
    });
  },

  // How far to scroll for anchor i of chapter c (its part s), f through its
  // span, at the reading line (its top, with f 0, at the top of what is in
  // sight).
  distanceTo(c, s, i, f) {
    const sh = this.shape(c);
    if (i < 0 && f <= 0) return s.getBoundingClientRect().top - this.view.inset();
    const a = i < 0 ? sh.top : sh.starts[i];
    if (a == null) return s.getBoundingClientRect().top - this.lineY();
    let b = i + 1 < sh.starts.length ? sh.starts[i + 1] : sh.end;
    if (b == null) b = this.contentY(s.getBoundingClientRect().bottom);
    return this.view.origin() + a + (f / 1000) * Math.max(0, b - a) - this.view.top() - this.lineY();
  },

  settle: null,
  settleNow() {
    const t = this.settle;
    if (!t || !t.s.isConnected) {
      this.settle = null;
      return;
    }
    this.scrollBy(this.distanceTo(t.c, t.s, t.i, t.f));
  },

  // A glide of its own: its scrolls not a finger's until it ends.
  glideTimer: 0,
  ownGlide: false,
  selfGlide(to) {
    clearTimeout(this.glideTimer);
    if (!this.ownGlide) this.self++;
    this.ownGlide = true;
    this.view.glideTo(to);
    this.glideTimer = setTimeout(() => this.stopGlide(), 450);
  },

  stopGlide() {
    clearTimeout(this.glideTimer);
    if (this.ownGlide) {
      this.ownGlide = false;
      this.self--;
      this.view.scrollTo(this.view.top());
      this.extend();
      this.tell(true);
    }
  },

  // `halt P`: its glide stopped where it is.
  halt() {
    this.stopGlide();
    if (this.gliding) {
      this.gliding = false;
      this.scrollBy(0);
    }
  },

  // The window emptied and begun again at part k of chapter c.
  restart(c, k) {
    this.main.replaceChildren(this.placeholder(c, k));
    this.asked.clear();
    this.want(c, k);
  },

  // ---- moving ----
  // At rest: told, with the last chapter whose end is in sight. (The other
  // has followed it frame by frame, and isn't moved now it rests.)
  rested() {
    this.moving = false;
    this.gliding = false;
    const bottom = this.view.bottom();
    let endsHi = -1;
    for (const s of this.sections()) {
      if (!s.laid) continue;
      const c = +s.dataset.c;
      const info = this.chapters.get(c);
      const last = !info || info.gap || +s.dataset.k + 1 >= info.n;
      const end = s.getBoundingClientRect().bottom;
      if (last && end <= bottom && end >= this.view.inset()) endsHi = Math.max(endsHi, info && info.gap ? info.gap[1] : c);
    }
    this.tell(true);
    send(`rest ${this.p} ${endsHi} ${clock()}`);
    followAheadSoon();
  },

  // A finger (or a wheel, a key) on it: it leads.
  touched() {
    this.finger = true;
    this.settle = null;
    this.stopGlide();
    followHeld = false;
    followRuled = false;
    if (this.p === 1 && panel.full) followFullReadOn = true;
    if (followGlide && followGlide.r === this) stopFollowGlide();
    leader = this.p;
    if (!this.moving) {
      this.moving = true;
      send(`moving ${this.p} ${clock()}`);
    }
  },

  released() {
    this.finger = false;
    if (this.moving) this.gliding = true;
  },

  // A wheel's turn: a finger's, while it turns.
  wheeled() {
    this.touched();
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => (this.finger = false), 120);
  },

  scrolled() {
    // (Leading, the other moved with it now, in the frame the scroll is
    // drawn in, whatever moved it.)
    if (leader === this.p) follow(this);
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.extend();
        this.tell(false);
      });
    }
    clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => {
      if (this.finger) return;
      this.extend();
      if (this.moving) this.rested();
      else this.tell(true);
    }, 160);
  },

  // The time core asked for (ms on this clock): tick then.
  wake(at) {
    clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(() => send(`tick ${clock()}`), Math.max(50, at - clock()));
  },

  // A page down (1) or up (-1), less three lines: a hand's move.
  page(d) {
    const line = emPx() * look.spacing;
    this.touched();
    this.finger = false;
    this.gliding = true;
    this.view.scrollBy(d * Math.max(line, this.view.height() - this.view.inset() - 3 * line));
  },

  // Listen's verse followed: moved to it if it isn't on the screen.
  follow(c, v) {
    for (const s of this.sections()) {
      if (+s.dataset.c !== c || !s.laid) continue;
      const t = s.querySelector(`[data-v="${v}"]`);
      if (!t) continue;
      const r = t.getBoundingClientRect();
      if (r.top >= this.view.inset() && r.top < this.view.bottom() * 0.7) return;
      this.scrollBy(r.top - this.lineY());
      this.extend();
      this.tell(true);
      return;
    }
    const info = this.chapters.get(c);
    const i = info ? info.anchors.findIndex((a) => a[0] === v) : -1;
    this.go(c, i, 0, 0);
  },

  // The verse being heard, washed (v 0: none).
  heard: null,
  hearing(c, v) {
    for (const t of this.main.querySelectorAll(".heard")) t.classList.remove("heard");
    this.heard = c >= 0 && v > 0 ? { c, v } : null;
    this.paintHeard();
  },

  paintHeard() {
    const h = this.heard;
    if (!h) return;
    for (const s of this.sections()) if (+s.dataset.c === h.c) for (const t of s.querySelectorAll(`[data-v="${h.v}"]`)) t.classList.add("heard");
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
    for (const s of this.sections()) if (+s.dataset.c === c) for (const t of s.querySelectorAll("[data-v]")) t.classList.toggle("sel", vs.has(+t.dataset.v));
  },

  // What is marked on the selected chapter changed: its parts asked for
  // again.
  reaskSelected() {
    const c = this.selC >= 0 ? this.selC : this.said.c;
    if (c >= 0) this.forget(c);
  },

  tapped(e) {
    if (String(window.getSelection())) return;
    const s = e.target.closest("section[data-c]");
    if (!s || !s.laid) return;
    const c = +s.dataset.c;
    const t = e.target.closest("[data-l]");
    if (t && s.links) {
      const l = s.links[+t.dataset.l];
      if (l) {
        if (!this.opts.tap && l[2] !== 1 && l[2] !== 2) return;
        send(l[2] === 0 ? `footnote ${c} ${l[3]}` : l[2] === 2 ? `word ${l[3]}` : l[2] === 3 ? `esvact ${l[3]} ${c}` : `preview ${l[3]}`);
        return;
      }
    }
    if (!this.opts.tap) return;
    const v = e.target.closest("[data-v]");
    send(v && +v.dataset.v > 0 ? `tapverse ${c} ${v.dataset.v}` : "tapnone");
  },
  };
}

// The parts walked each way past what is laid out at most, guessing where
// they would be, for following.
const GUESS_WALK_MOST = 4000;

// The chapters either side of each pane's whose maps following goes by
// (core sends those of two either side as the place comes near them).
const FOLLOW_CHAPTERS = 2;

// From a jump until a hand moves either pane, both panes are held where
// the jump put them (core's `go` for each, as a `go` holds its pane's
// place): the rule doesn't move either, so that Swap Panes and the way back
// leave both where they were.
let followHeld = false;

// The panel's reader sent where the rule puts it (`go` MODE 2: opened, its
// document come, the app restored): placed by the rule at once, and again
// as parts come, until a hand moves either pane.
let followRuled = false;

// Whether a hand moved the panel while it filled the window: beside the
// page again, the page follows it (else the page leads, and stays).
let followFullReadOn = false;

// While both panes rest, linked: the parts following goes by measured
// ahead, a part a turn (aheadNext).
let followAheadTimer = 0;

function followAheadSoon() {
  clearTimeout(followAheadTimer);
  followAheadTimer = setTimeout(followAhead, AHEAD_MS);
}

function followAhead() {
  if (!linked || !besideReader.main.isConnected || followGlide || panes.some((r) => r.moving || r.pending)) return followAheadSoon();
  const [from, to] = followChapters();
  if (from > to) return followAheadSoon();
  if (panes[1 - leader].aheadNext(from, to) || panes[leader].aheadNext(from, to)) followAheadSoon();
  // (Both at rest: the rule kept as what has been measured tells more.)
  follow(panes[leader]);
}

// How long between parts measured ahead (ms).
const AHEAD_MS = 40;

// Following once this turn's lines are taken (a part come may bring more:
// one following for them all, never inside another's).
let followFrame = 0;

function followSoon() {
  if (!followFrame) followFrame = requestAnimationFrame(() => {
    followFrame = 0;
    follow(panes[0]);
  });
}

// A jump (either pane's `go`: Go To, a link, Swap Panes): both panes held
// where it puts them until a hand moves either; the panel's sent where
// the rule puts it, so placed (the page going elsewhere with it, at launch,
// leaves it so).
const GO_RULED = 2;

function followJumped(p, mode) {
  if (p === 1 && mode === GO_RULED) {
    followRuled = true;
    followHeld = false;
  } else {
    followHeld = true;
    if (p === 1) followRuled = false;
  }
  stopFollowGlide();
}

// Each pane's top edge, down its content, and how tall its sight is.
const sightTop = (r) => r.contentY(r.view.inset());
const sightHeight = (r) => r.view.bottom() - r.view.inset();

// The chapters following goes by: two either side of each pane's at its
// top edge.
function followChapters() {
  let from = Infinity;
  let to = -Infinity;
  for (const r of panes) {
    const c = r.chapterAt(r.view.inset());
    if (c < 0) continue;
    from = Math.min(from, c - FOLLOW_CHAPTERS);
    to = Math.max(to, c + FOLLOW_CHAPTERS);
  }
  return [from, to];
}

// A pane moved by a hand (or a jump): the other moved by the rule, at once
// if the rule doesn't hold (SKINS.md, Panes: Linked; follow.js's rules, the
// same as core/follow.l8's): the section at the top pane's top edge has
// one linked with it as much in sight in the bottom pane as can be. The
// page is the top pane: moved, the panel moves; the panel moved, the page.
let following = false;

function follow(lead) {
  if (!linked || !besideReader.main.isConnected || following || (followHeld && !followRuled)) return;
  following = true;
  try {
    followNow(lead);
  } finally {
    following = false;
  }
}

// Whether the panel fills the window (over the page).
const panelFills = () => panel.full;

function followNow(lead) {
  const page = panes[0];
  const panel = panes[1];
  const [from, to] = followChapters();
  if (from > to) return;
  const pageGuess = page.guessParts(from, to);
  const panelGuess = panel.guessParts(from, to);
  const links = newLinks();
  for (let c = from; c <= to; c++) {
    const map = linkMaps.get(c);
    if (map) addLinks(links, map, page.shapeGuessed(c, pageGuess), panel.shapeGuessed(c, panelGuess));
  }
  const pageLeads = lead.p === 0 || followRuled;
  const moving = pageLeads ? panel : page;
  const y = pageLeads
    ? bottomMove(links, sightTop(page), sightTop(panel), sightHeight(panel))
    : topMove(links, sightTop(page), sightHeight(page), sightTop(panel), sightHeight(panel));
  // (Within a pixel: as near as a scroll's whole pixels come.)
  // (The page isn't moved while the panel fills the window over it: it is
  // where it was when the panel is beside it again.)
  if (y === null || Math.abs(y - sightTop(moving)) < 1 || (moving === page && panelFills())) return;
  // (Moved by following now: a `go`'s place held for it let go.)
  moving.settle = null;
  if (followRuled || reducedMotion()) {
    stopFollowGlide();
    moving.scrollBy(y - sightTop(moving));
    moving.extend();
    moving.tell(false);
  } else followGlideTo(moving, y);
}

// The pane following glides (its sight's top going to a place kept as a
// spot in a part, so that parts coming and going above it leave it the
// same), a frame at a time by follow.js's glide; a new place mid-glide is
// glided to from where it is.
let followGlide = null;

function followGlideTo(r, to) {
  if (followGlide && followGlide.r !== r) stopFollowGlide();
  const spot = r.spotOf(to);
  if (followGlide) {
    // (There at most GLIDE_MOST after its place was last new.)
    const was = r.spotY(followGlide.to);
    if (was === null || Math.abs(to - was) > 0.5) followGlide.new = performance.now();
    followGlide.to = spot;
    return;
  }
  // (Its first step now, in the frame the rule broke in.)
  followGlide = { r, to: spot, at: performance.now() - FRAME_MS, new: performance.now(), frame: 0 };
  followGlideFrame(performance.now());
}

// A frame's time, for a glide's first step (ms).
const FRAME_MS = 1000 / 60;

function followGlideFrame(now) {
  const g = followGlide;
  if (!g) return;
  const r = g.r;
  const from = sightTop(r);
  const to = r.spotY(g.to);
  if (to === null) {
    followGlide = null;
    return;
  }
  const seconds = Math.min(0.1, (now - g.at) / 1000);
  const next = glide(from, to, seconds, GLIDE_MOST - ((now - g.new) / 1000 - seconds));
  g.at = now;
  r.scrollBy(next - from);
  const moved = sightTop(r);
  r.extend();
  r.tell(false);
  // (There, or held at its content's end: over.)
  const at = sightTop(r);
  if (Math.abs(at - (r.spotY(g.to) ?? at)) <= 0.5 || (Math.abs(next - from) >= 0.1 && Math.abs(at - from) < 0.05)) {
    followGlide = null;
    return;
  }
  g.frame = requestAnimationFrame(followGlideFrame);
}

function stopFollowGlide() {
  if (followGlide) cancelAnimationFrame(followGlide.frame);
  followGlide = null;
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The page's view: the window, under the bar.
const windowView = {
  top: () => window.scrollY,
  height: () => innerHeight,
  scrollHeight: () => document.documentElement.scrollHeight,
  inset: () => barHeight(),
  origin: () => 0,
  // (Above the panel, when it is under the page.)
  bottom: () => {
    const p = panel.besideBox;
    const r = p && !p.hidden ? p.getBoundingClientRect() : null;
    return r && r.left < 1 && r.top > barHeight() ? r.top : innerHeight;
  },
  scrollTo: (y) => window.scrollTo({ top: Math.max(0, y), behavior: "instant" }),
  glideTo: (y) => window.scrollTo({ top: Math.max(0, y), behavior: "smooth" }),
  scrollBy: (dy) => window.scrollBy({ top: dy, behavior: "smooth" }),
};

// A scrolling element's view (the panel's list).
function elementView(box) {
  return {
    top: () => box.scrollTop,
    height: () => box.clientHeight,
    scrollHeight: () => box.scrollHeight,
    inset: () => box.getBoundingClientRect().top,
    origin: () => box.getBoundingClientRect().top,
    bottom: () => box.getBoundingClientRect().bottom,
    scrollTo: (y) => box.scrollTo({ top: Math.max(0, y), behavior: "instant" }),
    glideTo: (y) => box.scrollTo({ top: Math.max(0, y), behavior: "smooth" }),
    scrollBy: (dy) => box.scrollBy({ top: dy, behavior: "smooth" }),
  };
}

const reader = makeReader(0, $("#reader"), windowView, { tap: true, address: true });

// The panel's reader: its parts kept in a box of their own, put in the
// panel's list while core's screen with a `reader` line shows (core may
// say where it goes before that).
const besideReader = makeReader(1, el("div", "preader"), elementView(document.body), { tap: false, address: false });
const panes = [reader, besideReader];

// A span's paragraph (core/text.l8's PARA_): its kind (the pk classes)
// below PARA_KINDS; plus PARA_KINDS with a stanza's break before it; plus
// PARA_TIGHT followed by its apparatus.
const PARA_KINDS = 8;
const PARA_TIGHT = 16;

// A part laid out as the page's paragraphs: each line of its text a
// paragraph (its kind from its runs), each run a span in its style, with
// its verse (data-v; data-vs on a verse's first), its link (data-l) and
// its highlight; and for each of its `verse` lines (its anchors, in order)
// the span its words begin in.
function layChapter(text, spans, verses, links, marks) {
  const frag = document.createDocumentFragment();
  const anchors = new Array(verses.length).fill(null);
  let nextAnchor = 0;
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
  const seen = new Set();
  for (let i = 0; i + 1 < at.length; i++) {
    const a = at[i];
    const b = at[i + 1];
    if (text[a] === "\n") {
      if (!p.childNodes.length) p.append(" ");
      frag.appendChild(p);
      p = el("p");
      paraSet = false;
      continue;
    }
    while (si < spans.length && spans[si][1] <= a) si++;
    const sp = si < spans.length && spans[si][0] <= a ? spans[si] : null;
    if (sp && !paraSet) {
      const para = sp[3];
      const kind = para % PARA_KINDS;
      p.className = `pk${kind}${para & PARA_KINDS ? " stanza" : ""}${para & PARA_TIGHT ? " tight" : ""}`;
      paraSet = true;
    }
    const span = el("span", sp ? `s${sp[2]}` : "", text.slice(a, b));
    while (nextAnchor < verses.length && verses[nextAnchor][1] <= a) anchors[nextAnchor++] = span;
    let v = null;
    for (const x of verses) if (x[1] <= a && a < x[2]) v = x[0];
    if (v != null) {
      span.dataset.v = v;
      if (!seen.has(v)) {
        seen.add(v);
        span.dataset.vs = "1";
      }
      const m = marks.get(v);
      if (m && washes.has(m.hex)) span.style.backgroundColor = washes.get(m.hex);
    }
    const li = links.findIndex((l) => l[0] <= a && a < l[1]);
    if (li >= 0) span.dataset.l = li;
    p.appendChild(span);
  }
  if (p.childNodes.length) frag.appendChild(p);
  return { frag, anchors };
}

reader.main.addEventListener("click", (e) => reader.tapped(e));
const onPage = (e) => !e.target.closest || !e.target.closest(".panel");
for (const t of ["touchstart", "pointerdown"]) addEventListener(t, (e) => onPage(e) && reader.touched(), { passive: true });
addEventListener("wheel", (e) => onPage(e) && reader.wheeled(), { passive: true });
for (const t of ["touchend", "pointerup", "pointercancel"]) addEventListener(t, () => reader.released(), { passive: true });
addEventListener("scroll", () => reader.scrolled(), { passive: true });
addEventListener("resize", () => {
  for (const r of panes) r.resized();
});

// The versions an address can name (/read/kjv/john/3): the bundled ones.
// A version downloaded from the catalog isn't named, so the address
// (/read/john/3) opens in the version kept, as it is read now, not the BSB.
const ADDRESS_VERSIONS = ["bsb", "kjv", "web", "asv", "ylt", "esv"];

// The address: the place's chapter, as the browser keeps it (no new entry).
function address(c) {
  const a = chapterAddress(c);
  const word = bar.versionWord.toLowerCase();
  const v = ADDRESS_VERSIONS.includes(word) ? `${word}/` : "";
  if (a) history.replaceState(history.state, "", `/read/${v}${a}`);
}

// ---- menus ----
let menuOpen = null;

// Parent's children made those given, keeping each child that is already
// the same (equal nodes: the same words, classes and what they do, as
// data-act says), so an unchanged row or button is never removed and put
// back. Whole children are compared, in order; a control is the same only
// if it is set the same (a switch's state, a slider's value: properties,
// not attributes).
const CONTROLS = "input, select, progress, textarea";

function controlsSet(e) {
  if (e.nodeType !== Node.ELEMENT_NODE) return "";
  const all = e.matches(CONTROLS) ? [e] : [...e.querySelectorAll(CONTROLS)];
  return all.map((c) => `${c.value}|${c.checked}`).join(" ");
}

function morphChildren(parent, nodes) {
  const old = [...parent.childNodes];
  for (let i = 0; i < nodes.length; i++) {
    const was = old[i];
    const now = nodes[i];
    if (was && was.isEqualNode(now) && controlsSet(was) === controlsSet(now)) continue;
    // (The same words but for a count: its text changed where it is. The
    // same element, with the same attributes, so the same action: its
    // children made those given in turn.)
    if (was && was.nodeType === Node.TEXT_NODE && now.nodeType === Node.TEXT_NODE) was.nodeValue = now.nodeValue;
    else if (was && was.nodeType === Node.ELEMENT_NODE && !was.matches(CONTROLS) && was.cloneNode(false).isEqualNode(now.cloneNode(false))) morphChildren(was, [...now.childNodes]);
    else if (was) parent.replaceChild(now, was);
    else parent.appendChild(now);
  }
  for (let i = nodes.length; i < old.length; i++) old[i].remove();
}

// The longest the panel waits, laid out out of sight, for its reader to
// come to its place before it slides in anyway (ms).
const PANEL_COMPOSE_MS = 700;
const PANEL_OPENING_MS = 300;
// The panel under the page, out of sight past the window's foot: its
// height, and the page's soft foot over it (read.css, 32px over its 1px
// divider).
const UNDER_AWAY = "translateY(calc(100% + 33px))";

// ---- coming and going (as iOS's views do through UIKit: nothing pops) ----
// Element e shown, coming in from `from` (keyframe values: opacity 0 and a
// transform), over ms with curve; with reduced motion, by its opacity
// alone. A going animation still running on it is let go first.
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function comeIn(e, from, ms, easing = EASE_OUT) {
  e.leaving?.cancel();
  e.leaving = null;
  e.hidden = false;
  const first = reducedMotion() ? { opacity: 0 } : { opacity: 0, ...from };
  e.animate([first, { opacity: 1, transform: "none" }], { duration: ms, easing });
}

// Element e going: animated to `to`, then hidden, unless it is shown
// again meanwhile (comeIn lets the animation go); after() then runs.
function goOut(e, to, ms, after = () => {}, easing = "ease-in") {
  if (e.hidden) return after();
  // (From where it is: still coming in, it turns back from there.)
  const style = getComputedStyle(e);
  const first = { opacity: style.opacity, transform: style.transform };
  for (const a of e.getAnimations()) a.cancel();
  const last = reducedMotion() ? { opacity: 0 } : { opacity: 0, ...to };
  const a = e.animate([first, last], { duration: ms, easing });
  e.leaving = a;
  a.onfinish = () => {
    if (e.leaving !== a) return;
    e.leaving = null;
    e.hidden = true;
    after();
  };
}

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
  // (Grown from its button.)
  m.style.transformOrigin = `${r.left + r.width / 2 - parseFloat(m.style.left)}px ${below + m.offsetHeight < innerHeight ? "0" : "100%"}`;
  comeIn(m, { transform: "scale(0.96)" }, 120);
  m.querySelector("button")?.focus();
}

function closeMenu() {
  const m = menuOpen;
  menuOpen = null;
  if (m) goOut(m, { transform: "scale(0.96)" }, 100, () => m.remove());
}

addEventListener("pointerdown", (e) => {
  if (menuOpen && !menuOpen.contains(e.target)) closeMenu();
});

// ---- the panel: core's screens ----
// Two boxes, each a stack of screens, the top one shown: the sheet's
// (core's group 0), its Back the browser's too, and the panel beside the
// page (group 1), kept as it is under the sheet while sheets come and go.
// Beside the reader on a wide window, under it on a narrow one (or filling
// the window). The sheet fills a narrow window; on a wide one it is in the
// panel's column, but for Go To, a popover hanging from what opened it
// (the page's title, the panel's name), the same screen either way.
const panel = {
  // The sheet's box and the panel's beside the page.
  sheetBox: null,
  besideBox: null,
  stack: [],
  beside: [],
  besideOpen: false,
  // Whether the panel fills the window (core's `beside` line).
  full: false,
  // Its sweep to fill the window or back, while it runs.
  sweeping: null,
  fields: new Map(),
  typed: 0,
  pending: null,
  // The screen whose reader the panel's list holds (-1: none).
  readerFor: -1,
  depth: 0,
  ignorePops: 0,

  // The box of the screens shown: the sheet's while one is up.
  get box() {
    return this.stack.length ? this.sheetBox : this.besideBox;
  },

  init() {
    this.besideBox = this.makeBox("beside", "Panel");
    this.sheetBox = this.makeBox("stack", "Sheet");
    this.sheetBox.classList.add("sheet");
    this.sheetBox.setAttribute("role", "dialog");
    // (The panel's reader: told of its scrolling, and of a hand's.)
    const list = $(".plist", this.besideBox);
    besideReader.view = elementView(list);
    const inReader = () => list.contains(besideReader.main);
    list.addEventListener("scroll", () => inReader() && besideReader.scrolled(), { passive: true });
    for (const t of ["touchstart", "pointerdown"]) list.addEventListener(t, () => inReader() && besideReader.touched(), { passive: true });
    list.addEventListener("wheel", () => inReader() && besideReader.wheeled(), { passive: true });
    for (const t of ["touchend", "pointerup", "pointercancel"]) list.addEventListener(t, () => inReader() && besideReader.released(), { passive: true });
    list.addEventListener("click", (e) => inReader() && besideReader.tapped(e));
    $(".pfull", this.besideBox).addEventListener("click", () => send("tap full"));
    addEventListener("popstate", () => this.popped());
    // (A popover put away by a press outside it, as a menu is; its opener
    // left to open it again.)
    addEventListener("pointerdown", (e) => {
      const box = this.sheetBox;
      if (box.hidden || !box.classList.contains("popover") || box.contains(e.target) || menuOpen?.contains(e.target)) return;
      if (this.opener()?.contains(e.target)) return;
      while (this.stack.length) this.back(true);
    });
    addEventListener("resize", () => this.place());
  },

  // A box for the screens of this[which] ("stack" or "beside"): its bar,
  // field, choices, list and foot, its controls acting on their top.
  makeBox(which, label) {
    const p = el("aside", "panel");
    p.hidden = true;
    p.setAttribute("aria-label", label);
    p.innerHTML = `<div class="pbar"><button type="button" class="pback"></button><h2 class="ptitle"></h2><button type="button" class="psort" hidden></button><button type="button" class="pbutton" hidden></button><div class="pbartools" hidden></div><button type="button" class="pfull" hidden aria-label="Full Screen"></button><div class="arrival" hidden></div></div><div class="pfield" hidden><input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"></div><div class="pscopes" hidden></div><div class="psegments" hidden></div><div class="pfilter" hidden></div><div class="plist"></div><div class="ptools" hidden></div>`;
    document.body.appendChild(p);
    const top = () => this.topOf(this[which]);
    $(".pback", p).addEventListener("click", () => {
      const s = top();
      if (s && s.left && s.leftAction) send(`act ${s.id} ${s.leftAction} 0 0`);
      else this.userBack();
    });
    $(".pbutton", p).addEventListener("click", (e) => this.barButton(top(), e.currentTarget));
    $(".psort", p).addEventListener("click", (e) => {
      const s = top();
      popup(e.currentTarget, s.sorts.map((t, i) => ({ title: (i === s.sort ? "✓ " : "") + t, run: () => send(`act ${s.id} ${s.sortAction} 0 ${i}`) })));
    });
    const f = $(".pfield input", p);
    f.addEventListener("input", () => {
      const s = top();
      if (!s) return;
      clearTimeout(this.pending);
      this.pending = setTimeout(() => send(`query ${s.id} ${escape(f.value)}`), s.wait || 0);
    });
    f.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const s = top();
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
    return p;
  },

  // The screens shown: the sheet's, else those beside the page.
  current() {
    return this.stack.length ? this.stack : this.beside;
  },

  top() {
    return this.topOf(this.current());
  },

  // The top screen of a stack (this.stack or this.beside), or null.
  topOf(ids) {
    return ids.length ? screens.get(ids[ids.length - 1]) : null;
  },

  // The box showing screen id on top, with its screen; or null.
  showing(id) {
    for (const [ids, box] of [[this.stack, this.sheetBox], [this.beside, this.besideBox]]) {
      if (!box.hidden && ids.length && ids[ids.length - 1] === id) return { box, s: screens.get(id) };
    }
    return null;
  },

  present(id) {
    this.forgetFields(this.stack);
    this.stack = [id];
    this.showSheet(true);
    this.syncHistory();
  },

  push(id) {
    // (One of the panel's beside the page: on its screens.)
    if (screens.get(id)?.group === 1) {
      this.beside.push(id);
      this.showBeside(true);
      return;
    }
    this.stack.push(id);
    this.showSheet(true);
    this.syncHistory();
  },

  // The panel's first screen beside the page (its others pushed after).
  besideFirst(id) {
    this.forgetFields(this.beside);
    this.beside = [id];
    this.showBeside(true);
  },

  // `beside OPEN FULL`: the panel beside the page wanted, its screens
  // asked for, filling the window or not; or let go.
  besideLine(open, full) {
    const changed = (open && full) !== this.full;
    // (Beside the page again: the page follows the panel only if a hand
    // moved the panel while it filled the window.)
    if (this.full && !(open && full)) leader = followFullReadOn ? 1 : 0;
    if (!this.full && open && full) followFullReadOn = false;
    this.besideOpen = open;
    this.full = open && full;
    if (open && changed && this.beside.length) this.showBeside(false);
    $(".bar .shelf").setAttribute("aria-pressed", open ? "true" : "false");
    if (open) {
      if (!this.beside.length) send("panelmake");
      return;
    }
    this.forgetFields(this.beside);
    this.beside = [];
    this.hideBeside();
  },

  update(id) {
    if (this.stack.length && this.stack[this.stack.length - 1] === id) this.showSheet(false);
    else if (this.beside.length && this.beside[this.beside.length - 1] === id) this.showBeside(false);
  },

  // A screen's focus row brought into sight again (a commentary beside
  // the page following it).
  refocus(id) {
    const on = this.showing(id);
    if (!on) return;
    const list = $(".plist", on.box);
    const fr = list.querySelector(".focus");
    if (!fr) return;
    const at = fr.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTo({ top: at - 8, behavior: reducedMotion() ? "instant" : "smooth" });
  },

  // The focus row's words brought into sight, the list moving as little
  // as it can (Practice's words practised, the word being typed).
  reveal(id) {
    const on = this.showing(id);
    if (!on || !on.s.focusWords) return;
    const [from, to] = on.s.focusWords;
    const list = $(".plist", on.box);
    const row = list.querySelector(".focus");
    if (!row) return;
    let top = Infinity;
    let bottom = -Infinity;
    for (const span of row.querySelectorAll("[data-at]")) {
      const at = +span.dataset.at;
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const a = Math.max(from, at);
      const b = Math.min(to, at + node.length);
      if (b <= a) continue;
      const range = document.createRange();
      range.setStart(node, a - at);
      range.setEnd(node, b - at);
      const r = range.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    if (top === Infinity) return;
    const box = list.getBoundingClientRect();
    const margin = 16;
    let by = 0;
    if (top - margin < box.top) by = top - margin - box.top;
    else if (bottom + margin > box.bottom) by = Math.min(bottom + margin - box.bottom, top - margin - box.top);
    if (by) list.scrollBy({ top: by, behavior: reducedMotion() ? "instant" : "smooth" });
  },

  dismiss() {
    if (!this.stack.length) return;
    this.forgetFields(this.stack);
    this.stack = [];
    this.hideSheet();
    this.syncHistory();
  },

  // The fields kept for the screens of ids let go.
  forgetFields(ids) {
    for (const id of ids) this.fields.delete(id);
  },

  popTo(id) {
    // (One of the panel's beside the page: those above it let go; core
    // has let them go already.)
    if (!this.stack.includes(id) && this.beside.includes(id)) {
      while (this.beside[this.beside.length - 1] !== id) this.fields.delete(this.beside.pop());
      this.showBeside(false);
      return;
    }
    if (!this.stack.includes(id)) return;
    while (this.stack[this.stack.length - 1] !== id) this.fields.delete(this.stack.pop());
    this.showSheet(false);
    this.syncHistory();
  },

  // Back: the top screen let go, and core told (its field's words first).
  // Beside the page: the one under it shown (core told which), or, the
  // first, the panel put away.
  back(tell = true) {
    if (!this.stack.length) {
      if (!this.beside.length) return;
      if (this.beside.length === 1) {
        send("tap shelf");
        return;
      }
      this.fields.delete(this.beside.pop());
      send(`panelanchor ${this.beside[this.beside.length - 1]}`);
      this.showBeside(false);
      return;
    }
    const id = this.stack[this.stack.length - 1];
    if (tell) this.commitField(id);
    this.stack.pop();
    this.fields.delete(id);
    if (tell) send(`closed ${id}`);
    if (this.stack.length) this.showSheet(false);
    else this.hideSheet();
    this.syncHistory();
  },

  // Back, as the browser's Back is: one entry of its history (none for
  // the screens beside the page).
  userBack() {
    if (this.stack.length && this.depth > 0) history.back();
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

  // The panel sweeping to fill the window from beside the page (from
  // where it was, laid out filling it, the page shown under it until it
  // has), or back (kept filling the window, sliding to where it is beside
  // the page, then laid out there).
  sweep(from, full) {
    const p = this.besideBox;
    const body = document.body.classList;
    body.remove("sweeping-in", "sweeping-out");
    const to = p.getBoundingClientRect();
    body.add(full ? "sweeping-in" : "sweeping-out");
    const by = (a, b) => `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    const a = full
      ? p.animate([{ transform: by(from, to) }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" })
      : p.animate([{ transform: "none" }, { transform: by(to, from) }], { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
    this.sweeping?.cancel();
    this.sweeping = a;
    a.onfinish = a.oncancel = () => {
      if (this.sweeping !== a) return;
      this.sweeping = null;
      body.remove("sweeping-in", "sweeping-out");
      // (Back beside the page, its reader is laid out at its own width
      // only now.)
      if (!full && this.readerFor >= 0) besideReader.relaid();
    };
  },

  // Box p shown: a sheet comes up 12 px as it fades in (180 ms); the panel
  // beside the page is laid out out of sight first (its bar, its reader at
  // its place: nothing in it moves once it shows), then slides in from the
  // window's foot, or its trailing edge on a wide window (240 ms). Showing
  // "Opening…" (opening), it waits a little for the reader in its place.
  reveal(p, sheet, reading, opening) {
    if (sheet) {
      p.inert = false;
      return comeIn(p, { transform: "translateY(12px)" }, 180, "ease-out");
    }
    const from = { transform: p.classList.contains("under") ? UNDER_AWAY : "translateX(100%)" };
    p.leaving?.cancel();
    p.leaving = null;
    p.hidden = false;
    if (reducedMotion()) return comeIn(p, {}, 150);
    // (Laid out just past the window's edge, where it slides in from.)
    p.style.transform = from.transform;
    // (Laid out: what waited for it, Go To's sheet going, goes now.)
    const composed = () => {
      p.composing = false;
      p.composed?.();
      p.composed = null;
    };
    const slide = () => {
      p.style.transform = "";
      p.animate([from, { transform: "none" }], { duration: 240, easing: EASE_OUT });
      composed();
    };
    if (!reading && !opening) return slide();
    p.composing = true;
    const list = $(".plist", p);
    const name = $(".pback", p);
    let was = "";
    let still = 0;
    const began = performance.now();
    const look = () => {
      if (p.hidden) {
        p.style.transform = "";
        return composed();
      }
      const now = `${list.scrollTop} ${name.offsetWidth} ${$(".pbartools", p).childElementCount} ${besideReader.main.childElementCount}`;
      // (Still: its reader has gone where it was sent, no part yet to come.)
      const placed = this.readerFor >= 0 && !besideReader.pending && besideReader.main.childElementCount > 0;
      still = now === was && placed ? still + 1 : 0;
      was = now;
      const most = this.readerFor >= 0 ? PANEL_COMPOSE_MS : PANEL_OPENING_MS;
      if (still < 6 && performance.now() - began < most) return requestAnimationFrame(look);
      slide();
    };
    requestAnimationFrame(look);
  },

  // (Closed as the panel opens, Go To having picked what it reads: the
  // sheet goes as the panel slides in, with its curve, one movement.)
  hideSheet() {
    const p = this.sheetBox;
    p.shownId = -1;
    this.besideBox.inert = false;
    p.inert = true;
    const go = (easing) => {
      if (p.shownId !== -1) return;
      goOut(p, { transform: "translateY(12px)" }, 140, () => {
        p.classList.remove("popover");
        this.layout();
      }, easing);
    };
    // (The panel's screen comes in core's next message, not this one: it
    // is looked for at the next frame.)
    requestAnimationFrame(() => {
      if (this.besideBox.composing) this.besideBox.composed = () => go(EASE_OUT);
      else go();
    });
  },

  hideBeside() {
    const p = this.besideBox;
    p.shownId = -1;
    const to = { transform: p.classList.contains("under") ? UNDER_AWAY : "translateX(100%)" };
    goOut(p, to, 200, () => {
      p.classList.remove("under", "beside");
      document.body.classList.remove("beside-under", "full");
      this.layout();
    });
  },

  // The page's room as the boxes shown leave it: beside the panel's
  // column on a wide window while the panel or a sheet in its column
  // shows (a popover leaves the page as it is).
  layout() {
    const sheet = !this.sheetBox.hidden && !this.sheetBox.classList.contains("popover");
    document.body.classList.toggle("panel-open", !this.besideBox.hidden || sheet);
  },

  // Whether Go To hangs from its opener: a popover, on a wide window.
  popover() {
    const first = screens.get(this.stack[0]);
    return !!first && first.kind === SCR_GOTO && matchMedia(`(min-width: ${WIDE_PX}px)`).matches;
  },

  // What opened the sheet's Go To: the panel's name for the panel (the
  // bar's panel button while the panel isn't shown), else the page's
  // title.
  opener() {
    const first = screens.get(this.stack[0]);
    if (!first || first.kind !== SCR_GOTO) return null;
    if (first.arg !== GOTO_PANEL) return bar.titleButton;
    const name = $(".pbar.reading .pback", this.besideBox);
    return !this.besideBox.hidden && name ? name : $(".bar .shelf");
  },

  // The popover put under its opener (the same size from either), within
  // the window.
  place() {
    const p = this.sheetBox;
    if (p.hidden) return;
    const pop = this.popover();
    p.classList.toggle("popover", pop);
    this.layout();
    if (!pop) {
      p.style.left = p.style.top = "";
      return;
    }
    const at = (this.opener() ?? bar.titleButton).getBoundingClientRect();
    // (Inside the page's width: its scrollbar's left out.)
    const room = document.documentElement.clientWidth;
    p.style.left = `${Math.max(POPOVER_MARGIN, Math.min(at.left, room - p.offsetWidth - POPOVER_MARGIN))}px`;
    p.style.top = `${at.bottom + POPOVER_GAP}px`;
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
    const on = this.showing(id);
    if (!on || on.box.shownId !== id) return;
    const s = on.s;
    $(".pfield input", on.box).value = s.searchText;
    // (And a field row's words as core has them: emptied for the next
    // answer.)
    const f = this.fields.get(id), r = fieldRow(s);
    if (f && r) f.value = r.detail;
    // (A field that keeps the keys takes them again: the next answer.)
    if (f && r && r.flag("e")) f.focus({ preventScroll: true });
  },

  barButton(s, b) {
    if (!s) return;
    if (s.confirm) {
      this.commitField(s.id);
      send(`act ${s.id} ${s.confirmAction} 0 0`);
    } else if (s.commands.length) popup(b, s.commands.map((c) => ({ title: c.title, destructive: c.destructive, run: () => send(`act ${s.id} ${c.action} ${c.arg} 0`) })));
  },

  act(s, r, value = 0) {
    send(`act ${s.id} ${r.action} ${r.arg} ${value}`);
  },

  // The sheet's top screen shown (fresh: just opened, at its focus), over
  // the panel beside the page; that panel left to the reader and the keys.
  showSheet(fresh) {
    const s = this.topOf(this.stack);
    if (!s) return;
    const p = this.sheetBox;
    this.fill(p, s, fresh);
    p.setAttribute("aria-label", s.title || "Sheet");
    this.besideBox.inert = true;
    this.place();
  },

  // The panel's top screen beside the page shown: under the page on a
  // narrow window, at its right on a wide one, or filling the window.
  showBeside(fresh) {
    const s = this.topOf(this.beside);
    if (!s) return;
    const p = this.besideBox;
    const full = this.full;
    const refills = full !== document.body.classList.contains("full");
    const sweeps = refills && !p.hidden && !reducedMotion();
    const from = sweeps ? p.getBoundingClientRect() : null;
    p.classList.toggle("under", !full);
    p.classList.add("beside");
    document.body.classList.toggle("beside-under", !full);
    document.body.classList.toggle("full", full);
    const fb = $(".pfull", p);
    // (The panel's reader has Full Screen in its menu.)
    fb.hidden = !!s.reader;
    fb.replaceChildren(icon(full ? "minimize-2" : "maximize-2"));
    fb.setAttribute("aria-label", full ? "Beside the Bible" : "Full Screen");
    if (from) this.sweep(from, full);
    this.fill(p, s, fresh);
    // (Its reader's text at the page's size filling the window, else 0.9
    // of it: its place kept through the change.)
    if (refills && s.reader && this.readerFor === s.id) besideReader.relaid();
    this.layout();
    // (A Go To hanging from the panel's name follows it.)
    this.place();
  },

  // Screen s drawn in box p (fresh: just opened, at its focus).
  fill(p, s, fresh) {
    const sheet = p === this.sheetBox;
    const typingIn = this.fields.get(s.id);
    const focused = typingIn && document.activeElement === typingIn ? [typingIn.selectionStart, typingIn.selectionEnd] : null;
    const list = $(".plist", p);
    const scroll = fresh ? 0 : list.scrollTop;
    // (Its title, and under it what it is of.)
    // (The panel's reader's name and chapter: one quiet title that opens Go
    // To, "Spurgeon · Psalm 147 ⌄", in the left button.)
    const named = !!(s.left && s.reader);
    const title = $(".ptitle", p);
    title.textContent = named ? "" : s.title;
    if (s.subtitle) title.appendChild(el("small", "", s.subtitle));
    const back = $(".pback", p);
    const depth = (sheet ? this.stack : this.beside).length;
    // (Its words in spans of their own, cut short with an ellipsis where
    // they don't fit (read.css: the name first); the icon after them
    // always shown.)
    back.replaceChildren(s.left ? el("span", "pname", s.left) : icon(depth > 1 ? "chevron-left" : "x"));
    if (named && s.title) back.append(el("span", "pmid", "·"), el("span", "pchapter", s.title));
    if (s.left && s.leftIcon) back.appendChild(symbol(s.leftIcon) ?? document.createTextNode(""));
    back.classList.toggle("named", named);
    $(".pbar", p).classList.toggle("reading", !!s.reader);
    back.setAttribute("aria-label", named && s.title ? `${s.left}, ${s.title}` : s.left || (depth > 1 ? "Back" : "Close"));
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
    if (p.shownId !== s.id) {
      clearTimeout(this.pending);
      input.value = s.searchText;
    }
    this.showScopes(p, s);
    this.showSegments(p, s);
    this.showFilter(p, s);
    this.showTools(p, s);
    // (The panel's reader, pane 1: put in the panel's list while its
    // screen shows, kept as it is while the screen is made again; where it
    // goes is core's.)
    const reading = !sheet && !!s.reader;
    if (reading && this.readerFor !== s.id) {
      list.replaceChildren(besideReader.main);
      this.readerFor = s.id;
      besideReader.resized();
      besideReader.finishPending();
    } else if (!reading) {
      if (!sheet) this.readerFor = -1;
      // (Made again, the same screen keeps the rows that haven't changed:
      // nothing in sight is taken out and put back. Their taps go to the
      // screen they were made for: another's are made anew.)
      if (fresh || p.shownId !== s.id) list.replaceChildren(this.rows(s));
      else morphChildren(list, [...this.rows(s).childNodes]);
    }
    // (A screen that takes letters: a field of its own, so a phone's
    // keyboard comes up; what is typed in it goes to core a letter at a
    // time.)
    let trap = $(".keytrap", p);
    if (s.keys) {
      if (!trap) {
        trap = el("input", "keytrap");
        trap.setAttribute("aria-label", "Type the first letters");
        trap.autocapitalize = "off";
        trap.autocomplete = "off";
        trap.spellcheck = false;
        trap.addEventListener("input", () => {
          const top = this.topOf(sheet ? this.stack : this.beside);
          for (const ch of trap.value) if (top && top.keys && ch !== " ") send(`act ${top.id} ${top.keys} ${ch.codePointAt(0)} 0`);
          trap.value = "";
        });
        p.appendChild(trap);
      }
      if (document.activeElement !== trap) trap.focus({ preventScroll: true });
    } else if (trap) trap.remove();
    list.classList.toggle("page", !!s.page);
    const opening = !sheet && !reading && s.sections.some((sec) => sec.rows.some((r) => r.flag("w")));
    // (A sheet still there, going as the panel opens, is shown again.)
    if (p.hidden || p.leaving || (sheet && p.inert)) this.reveal(p, sheet, reading, opening);
    // (Its field takes the keys as it opens: where core says, and wherever
    // there is a keyboard and a pointer, as a web page's search does.)
    const typeIn = sheet && s.search && (s.focusField || !matchMedia("(pointer: coarse)").matches);
    if (fresh && typeIn) input.focus();
    if (focused && this.fields.get(s.id)) {
      const f = this.fields.get(s.id);
      f.focus();
      f.setSelectionRange(focused[0], focused[1]);
    }
    if (reading) {
      // (The reader keeps its own place.)
    } else if (fresh) {
      const fr = list.querySelector(".focus");
      if (fr) {
        const at = fr.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
        list.scrollTop = at - (s.focusMode === 1 || s.focusMode === 2 ? list.clientHeight / 2 : 8);
        if (s.focusMode === 3) fr.classList.add("washed");
      } else list.scrollTop = 0;
      // (A sheet takes the keys; what is beside the page leaves them to it.)
      if (!typeIn && sheet) $(".pback", p).focus({ preventScroll: true });
    } else list.scrollTop = scroll;
    p.shownId = s.id;
  },

  showScopes(p, s) {
    const box = $(".pscopes", p);
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

  showSegments(p, s) {
    const box = $(".psegments", p);
    box.hidden = !s.segments.length;
    box.replaceChildren(...s.segments.map((t, i) => {
      const b = el("button", i === s.segment ? "on" : "", t);
      b.type = "button";
      b.setAttribute("aria-pressed", i === s.segment);
      b.addEventListener("click", () => {
        send(`act ${s.id} ${s.segmentsAction} 0 ${i}`);
        // (Another segment's rows from their top.)
        $(".plist", p).scrollTop = 0;
      });
      return b;
    }));
  },

  showFilter(p, s) {
    const box = $(".pfilter", p);
    box.hidden = !s.filterColors.length;
    const all = el("button", s.filter < 0 ? "on" : "", "All");
    all.type = "button";
    all.addEventListener("click", () => send(`act ${s.id} ${s.filterAction} 0 -1`));
    box.replaceChildren(all, ...s.filterColors.map((hex, i) => {
      const b = el("button", "dot" + (i === s.filter ? " on" : ""));
      b.type = "button";
      b.style.background = `linear-gradient(${washes.get(hex) ?? "#" + hex}, ${washes.get(hex) ?? "#" + hex}), var(--bg)`;
      b.setAttribute("aria-label", s.filterLabels[i] || hex);
      b.addEventListener("click", () => send(`act ${s.id} ${s.filterAction} 0 ${i}`));
      return b;
    }));
  },

  // The buttons at its foot: left, middle, right; the panel's reader's in
  // its bar, at the right (one row: its name, Link, its menu).
  showTools(p, s) {
    const inBar = !!s.reader;
    const box = $(".ptools", p);
    const barBox = $(".pbartools", p);
    box.hidden = inBar || !s.tools.length;
    barBox.hidden = !inBar || !s.tools.length;
    if (inBar) box.replaceChildren();
    else barBox.replaceChildren();
    // (Its screen, which a kept tool's tap goes to: a screen made anew
    // with the same tools keeps them.)
    const holder = inBar ? barBox : box;
    holder.screen = s;
    const places = [el("div", "left"), el("div", "middle"), el("div", "right")];
    for (const t of s.tools) {
      const b = el("button", `tool st${t.style}`);
      b.type = "button";
      // (A title; else core's icon, drawn, its label spoken.)
      const ic = SYMBOLS[t.icon];
      if (t.title) b.textContent = t.title;
      else if (ic) {
        b.appendChild(icon(ic));
        b.classList.add("icon");
      } else b.textContent = t.label || glyph(t.icon);
      if (t.label) b.setAttribute("aria-label", t.label);
      b.disabled = t.style === 3;
      // (What it does, in its node too, so an unchanged tool is kept.)
      b.dataset.act = `${t.action} ${t.arg} ${t.menu}`;
      b.addEventListener("click", () => {
        const id = holder.screen.id;
        if (t.menu) popup(b, split(t.menu).map((m) => {
          const k = m.indexOf(":");
          return { title: m.slice(k + 1), run: () => send(`act ${id} ${t.action} ${m.slice(0, k)} 0`) };
        }));
        else send(`act ${id} ${t.action} ${t.arg} 0`);
      });
      places[Math.max(0, Math.min(2, t.place))].appendChild(b);
    }
    morphChildren(holder, places);
  },

  // The screen's rows: its hero, intro, sections (headers, rows, footers).
  rows(s) {
    const frag = document.createDocumentFragment();
    if (s.hero) {
      const h = el("div", s.heroLarge ? "hero large" : "hero");
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
      const credit = credits.get(sec.credit);
      if (credit) {
        const a = el("a", "credit", credit.words + credit.link);
        a.setAttribute("aria-label", credit.label);
        a.href = credit.address;
        a.target = "_blank";
        a.rel = "noopener";
        frag.appendChild(a);
      }
    }
    if (none && s.emptyTitle) {
      const e = el("div", "empty");
      const g = s.emptySymbol && symbol(s.emptySymbol, "esym");
      if (g) e.appendChild(g);
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
    if (r.custom === CUSTOM_CARD) return cardRow(r);
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
      const g = symbol(r.icon);
      if (g) {
        const ic = el("span", "ricon" + (r.flag("g") ? " faint" : ""));
        ic.appendChild(g);
        if (r.iconColor) ic.style.color = "#" + r.iconColor;
        ic.setAttribute("aria-hidden", "true");
        line.appendChild(ic);
      }
    }
    if (r.lead) line.appendChild(el("span", "lead", r.lead));
    const words = el("div", "words");
    const t = el("div", "rt");
    rich(t, r.title, r.truns);
    if (r.custom === CUSTOM_FONT) t.style.fontFamily = FONTS[+r.arg] || "";
    if (r.suffix) t.appendChild(el("span", "suffix", r.suffix));
    if (r.flag("x")) line.classList.add("destructive");
    else if (r.flag("t")) t.classList.add("accent");
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
    if (r.custom === CUSTOM_DOWNLOAD) {
      const bar = el("progress", "coming");
      bar.max = 1000;
      bar.value = Math.max(0, Math.min(1000, r.value));
      bar.setAttribute("aria-valuetext", `${Math.floor(bar.value / 10)}%`);
      line.appendChild(bar);
    }
    if (r.trailing) line.appendChild(el("span", "trailing" + (r.flag("a") ? " accent" : ""), r.trailing));
    if (tappable) {
      if (r.detail && r.flag("v")) line.appendChild(el("span", "value", r.detail));
      const mark = r.acc === "check" || r.acc === "done" ? "check" : r.acc === "more" ? "chevron-right" : r.acc === "link" ? "arrow-up-right" : "";
      if (mark) {
        const a = el("span", `acc acc-${r.acc}`);
        a.appendChild(icon(mark));
        if (accessories.has(r.acc)) a.setAttribute("aria-label", accessories.get(r.acc));
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
        // (What it does, in its node too: a screen made again keeps a row
        // that looks and acts the same, morphChildren.)
        line.dataset.act = `${r.action} ${r.arg}`;
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
    // (A paragraph with an action of its own, such as a comment's verses.)
    if (r.action) {
      p.classList.add("tap");
      p.addEventListener("click", (e) => {
        if (!e.target.closest("a")) this.act(s, r);
      });
    }
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
      // (A reference: each word capitalized; letters as typed: none.)
      f.autocapitalize = r.fieldKind === 1 ? "words" : r.fieldKind === 3 ? "none" : "sentences";
      if (r.fieldKind === 1 || r.fieldKind === 3) f.spellcheck = false;
      if (r.fieldKind === 3) {
        f.setAttribute("autocorrect", "off");
        f.autocomplete = "off";
      }
      // (The screen as core last made it: its row and confirm may have
      // changed since the field was made, as an exercise's Check becomes
      // Next.)
      const current = () => screens.get(s.id) ?? s;
      f.addEventListener("input", () => {
        this.typed = Date.now();
        const now = fieldRow(current());
        if (now && now.flag("l")) send(`text ${s.id} ${now.action} ${now.arg} ${escape(f.value)}`);
      });
      f.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || r.fieldKind === 2) return;
        e.preventDefault();
        const cur = current();
        const now = fieldRow(cur);
        if (!now) return;
        if (!now.flag("l")) send(`text ${s.id} ${now.action} ${now.arg} ${escape(f.value)}`);
        // (A field that keeps the keys: the screen's submit, typing on.)
        if (now.flag("e")) send(`submit ${s.id}`);
        else if (now.flag("r") && cur.confirm) send(`act ${s.id} ${cur.confirmAction} 0 0`);
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
    const flow = el("div", "tiles" + (r.value & 1 ? " rtl" : "") + (r.value & 2 ? " large" : ""));
    for (const c of r.cells) {
      const added = c.flags & 16;
      // (A choice offered: its words alone, as a button.)
      if (c.flags & 256) {
        const o = el("button", "tile option" + (c.flags & 32 ? " selected" : ""), c.sub);
        o.type = "button";
        o.setAttribute("aria-label", c.label);
        o.addEventListener("click", () => send(`act ${s.id} ${c.action} ${c.arg} 0`));
        flow.appendChild(o);
        continue;
      }
      const t = el(added ? "div" : "button", "tile" + (c.flags & 32 ? " selected" : "") + (c.flags & 128 ? " wrong" : ""));
      const sub = el("span", "tsub" + (added || c.flags & 8 ? " faint" : "") + (c.flags & 4 ? " helped" : "")
        + (c.flags & 128 ? " wrong" : ""), c.sub);
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

// ---- the card (core/share.l8's): drawn at its pixels on a canvas ----
// Its words' runs: RUN_CARD + the piece's kind (0 words, 1 supplied, 2 His
// words, 3 both, 4 a verse's number) + 8 indented + 16 Greek + 32 Hebrew
// + 64 small capitals.
const RUN_CARD = 300;
let card = null;

function cardRow(r) {
  card = { r, canvas: drawCard(r), file: null };
  const box = el("div", "card");
  const c = card.canvas;
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", r.label);
  box.appendChild(c);
  // (Drawn again once the faces have come; its image made ready to share,
  // a share needing it at once.)
  const mine = card;
  document.fonts.ready.then(() => {
    if (card !== mine) return;
    const again = drawCard(r);
    c.getContext("2d").drawImage(again, 0, 0);
    c.toBlob((b) => {
      if (card === mine && b) mine.file = new File([b], cardName(r), { type: "image/png" });
    }, "image/png");
  });
  return box;
}

function cardName(r) {
  return `${r.title} ${r.suffix}`.replace(/[:/\\]/g, "_").replace(/\s+/g, " ").trim() + ".png";
}

function cardFaces() {
  const css = getComputedStyle(document.documentElement);
  const v = (n, d) => css.getPropertyValue(n).trim() || d;
  return { body: v("--body", "serif"), ui: v("--ui", "system-ui, sans-serif"), orig: v("--orig", "serif") };
}

function drawCard(r) {
  const m = r.trailing.split(" ").map(Number);
  const [W, H, margin, gap, refSize, versionSize, most, least, step] = m;
  const [bg, ink, faint, accent] = split(r.options).map((h) => "#" + h);
  const f = cardFaces();
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  // The pieces: words split where they may break (after a space), lines
  // broken where core breaks them.
  const pieces = [];
  let at = 0;
  for (const [end, st] of r.runs) {
    if (end > at) pieces.push({ text: r.detail.slice(at, end), st: st - RUN_CARD });
    at = end;
  }
  if (at < r.detail.length) pieces.push({ text: r.detail.slice(at), st: 0 });
  const rtl = pieces.some((p) => p.st & 32);
  const atoms = [];
  let atom = { parts: [], brk: false, indent: false };
  const flush = (brk) => {
    if (atom.parts.length) atoms.push(atom);
    atom = { parts: [], brk, indent: false };
  };
  for (const p of pieces) {
    for (const bit of p.text.split(/(\n| )/)) {
      if (bit === "\n") flush(true);
      else if (bit === " ") {
        if (atom.parts.length) atom.parts[atom.parts.length - 1].text += " ";
        flush(false);
      } else if (bit) {
        if (!atom.parts.length) atom.indent = !!(p.st & 8);
        atom.parts.push({ text: bit, st: p.st });
      }
    }
  }
  flush(false);
  const font = (st, s) => {
    const k = st & 7;
    if (k === 4) return `${s * 0.6}px ${f.ui}`;
    const size = st & 64 ? s * 0.8 : st & 32 ? s * 1.15 : s;
    const face = st & 32 ? f.ui : st & 16 ? f.orig : f.body;
    return `${k === 1 || k === 3 ? "italic " : ""}${size}px ${face}`;
  };
  const color = (st) => ((st & 7) === 4 ? faint : (st & 7) === 2 || (st & 7) === 3 ? accent : ink);
  const w = W - 2 * margin;
  const width = (a, s) => a.parts.reduce((x, p) => {
    g.font = font(p.st, s);
    return x + g.measureText(p.text).width;
  }, 0);
  // Lines at size s: each its atoms, indent and whether a paragraph ends.
  const lay = (s) => {
    const lines = [];
    let line = null;
    for (const a of atoms) {
      const aw = width(a, s);
      const ind = a.indent ? 40 : 0;
      if (!line || a.brk || (line.w + aw > w - line.ind && line.atoms.length)) {
        if (line && a.brk) line.end = true;
        line = { atoms: [], w: 0, ind: line && !a.brk ? line.ind : ind, end: false };
        lines.push(line);
      }
      line.atoms.push({ a, w: aw });
      line.w += aw;
    }
    const lh = s * (rtl ? 1.5 : 1.35);
    const h = lines.length * lh + lines.filter((l) => l.end).length * s * 0.25;
    return { lines, lh, h };
  };
  const refH = refSize * 1.25;
  const room = H - 2 * margin - gap - refH;
  let s = most;
  let L = lay(s);
  while (s > least && L.h > room) {
    s -= step;
    L = lay(s);
  }
  const top = Math.max(margin, (H - L.h - gap - refH) / 2);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "alphabetic";
  let y = top;
  for (const line of L.lines) {
    const base = y + L.lh * 0.78;
    let x = rtl ? W - margin - line.ind : margin + line.ind;
    for (const { a } of line.atoms) {
      for (const p of rtl ? [...a.parts].reverse() : a.parts) {
        g.font = font(p.st, s);
        g.fillStyle = color(p.st);
        const pw = g.measureText(p.text).width;
        if (rtl) x -= pw;
        g.fillText(p.text, x, (p.st & 7) === 4 ? base - s * 0.3 : base);
        if (!rtl) x += pw;
      }
    }
    y += L.lh + (line.end ? s * 0.25 : 0);
  }
  // The reference, then the version, under the words (at the right under
  // Hebrew).
  const ry = top + L.h + gap + refSize;
  g.font = `600 ${refSize}px ${f.ui}`;
  const rw = g.measureText(r.title).width;
  g.font = `${versionSize}px ${f.ui}`;
  const vw = g.measureText(" " + r.suffix.trim()).width;
  let x = rtl ? W - margin - rw - vw : margin;
  g.font = `600 ${refSize}px ${f.ui}`;
  g.fillStyle = accent;
  g.fillText(r.title, x, ry);
  x += rw;
  g.font = `${versionSize}px ${f.ui}`;
  g.fillStyle = faint;
  g.fillText(" " + r.suffix.trim(), x, ry);
  return c;
}

// Share Image: the card's image to the platform's share (else saved).
function shareCard(words) {
  if (!card) return;
  const go = (file) => {
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {});
      return;
    }
    const a = el("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  void words;
  if (card.file) go(card.file);
  else {
    const mine = card;
    drawCard(mine.r).toBlob((b) => b && go(new File([b], cardName(mine.r), { type: "image/png" })), "image/png");
  }
}

function fieldRow(s) {
  for (const sec of s.sections) for (const r of sec.rows) if (r.kind === "field") return r;
  return null;
}

// A row's detail: the places its screen's field found stressed, and the
// divine name's letters core marks (CAPS) in small capitals.
function marked(node, r) {
  if (r.marks.length < 2 && r.caps.length < 2) {
    node.textContent = r.detail;
    return;
  }
  const n = r.detail.length;
  const within = (pairs, i) => {
    for (let k = 0; k + 1 < pairs.length; k += 2) if (pairs[k] <= i && i < pairs[k + 1]) return true;
    return false;
  };
  const cuts = [...new Set([0, n, ...r.marks, ...r.caps].map((p) => Math.max(0, Math.min(p, n))))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const b = cuts[i];
    let part = document.createTextNode(r.detail.slice(b, cuts[i + 1]));
    if (within(r.caps, b)) {
      const s = el("span", "divine");
      s.append(part);
      part = s;
    }
    if (within(r.marks, b)) {
      const m = el("mark", "");
      m.append(part);
      part = m;
    }
    node.append(part);
  }
}

// Core's icons (Apple's symbols' names) as the page's own (icons.svg).
const SYMBOLS = {
  link: "link", "play.fill": "play", repeat: "repeat", "speaker.wave.2": "volume", keyboard: "keyboard",
  "keyboard.chevron.compact.down": "keyboard-off", plus: "plus", "square.and.arrow.up": "share",
  "square.and.pencil": "square-pen", "chevron.up": "chevron-up", "chevron.down": "chevron-down",
  "pause.fill": "pause", "stop.fill": "square", book: "book", "book.closed": "book",
  bookmark: "bookmark", "bookmark.fill": "bookmark", "books.vertical": "library", brain: "brain",
  calendar: "calendar", "character.book.closed": "book-a", "doc.on.doc": "copy",
  "note.text": "sticky-note", "text.quote": "text-quote", "clock.arrow.circlepath": "history",
  globe: "globe", "arrow.right.circle": "circle-arrow-right", "arrow.down.circle": "circle-arrow-down", "arrow.right.circle.fill": "circle-arrow-right", "arrow.right": "arrow-right",
  "arrow.triangle.branch": "split", "arrow.up.arrow.down": "arrow-up-down", "checkmark.circle": "circle-check",
  "circle.slash": "circle-slash", "hand.tap": "pointer", "info.circle": "info", "textformat.abc": "case-sensitive",
  "textformat.size": "a-large-small", "text.book.closed": "book-text", trash: "trash-2",
  magnifyingglass: "search", highlighter: "highlighter", xmark: "x", headphones: "headphones", link: "link",
  "arrow.up.left.and.arrow.down.right": "maximize-2", "arrow.down.right.and.arrow.up.left": "minimize-2",
  ellipsis: "more",
};

// An icon core names, drawn (else a character that reads as it; else
// nothing).
function symbol(name, cls = "") {
  if (SYMBOLS[name]) {
    const s = icon(SYMBOLS[name]);
    if (cls) s.setAttribute("class", cls);
    return s;
  }
  const g = glyph(name);
  return g ? el("span", cls, g) : null;
}

// An icon core names (an SF Symbol's name) as a character, where one reads
// as it ("" for those left out).
function glyph(name) {
  return {
    ribbon: "▮", plus: "+", circle: "○", "circle.lefthalf.filled": "◐", "checkmark.circle.fill": "●",
    "clock.arrow.circlepath": "↺", globe: "⊕", "arrow.right.circle.fill": "→", "arrow.right": "→", "square.and.arrow.up": "⇪",
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
          // (The wash a highlighted verse shows, over the page's color,
          // not the color's pure hue.)
          if (h) d.style.background = `linear-gradient(${washes.get(h) ?? "#" + h}, ${washes.get(h) ?? "#" + h}), var(--bg)`;
          d.setAttribute("aria-label", labels[j] || "Remove");
          d.addEventListener("click", () => send(`trayact ${r.action} ${h ? j : 5}`));
          sw.appendChild(d);
        });
        continue;
      }
      const x = el("button", r.flag("t") ? "accent" : "");
      const g = r.icon && symbol(r.icon);
      if (g) x.appendChild(g);
      x.appendChild(el("span", "tl", r.title));
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
      goOut(this.box, {}, 120);
      send("back");
    });
    document.body.appendChild(this.box);
  },
  // (back MS SCREENS WORDS HINT: shown for MS; faded in once the jump has
  // settled, faded out.)
  show(words, hint, ms) {
    clearTimeout(this.timer);
    if (!words) {
      goOut(this.box, {}, 120);
      return;
    }
    this.box.textContent = `‹ ${words}`;
    this.box.setAttribute("aria-label", words);
    this.box.setAttribute("aria-description", hint);
    if (this.box.hidden || this.box.leaving) comeIn(this.box, {}, 160, "ease-out");
    this.timer = setTimeout(() => goOut(this.box, {}, 120), ms);
  },
};

const player = {
  box: null,
  playing: true,
  init() {
    this.box = el("div", "player");
    this.box.hidden = true;
    this.box.innerHTML = `<div class="pw"><div class="pt"></div><div class="ps"></div></div>`;
    const button = (cls, label, name, line) => {
      const b = el("button", cls);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.appendChild(icon(name));
      b.addEventListener("click", () => send(typeof line === "function" ? line() : line));
      this.box.appendChild(b);
      return b;
    };
    button("prev", "Previous", "skip-back", "listenprev");
    this.toggle = button("toggle", "Pause", "pause", () => (this.playing ? "listenpause" : "listenplay"));
    button("next", "Next", "skip-forward", "listennext");
    button("stop", "Stop Listening", "x", "listenstop");
    document.body.appendChild(this.box);
  },
  show(title, state, playing, reader, version, button, buttonSymbol) {
    this.session(title, playing, reader, version);
    $(".pt", this.box).textContent = title;
    $(".ps", this.box).textContent = state;
    this.playing = playing;
    this.toggle.replaceChildren(symbol(buttonSymbol) ?? "");
    this.toggle.setAttribute("aria-label", button);
    this.box.hidden = false;
  },
  hide() {
    this.box.hidden = true;
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  },
  // The platform's own player (a lock screen's, a headset's buttons):
  // what plays, and its controls core's.
  session(title, playing, reader, version) {
    const ms = navigator.mediaSession;
    if (!ms || !window.MediaMetadata) return;
    if (!this.handled) {
      this.handled = true;
      const on = (a, line) => {
        try {
          ms.setActionHandler(a, () => send(line));
        } catch {}
      };
      on("play", "listenplay");
      on("pause", "listenpause");
      on("previoustrack", "listenprev");
      on("nexttrack", "listennext");
      on("stop", "listenstop");
    }
    const m = ms.metadata;
    if (!m || m.title !== title || m.artist !== reader || m.album !== version) {
      ms.metadata = new MediaMetadata({ title, artist: reader, album: version, artwork: [{ src: "/img/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] });
    }
    ms.playbackState = playing ? "playing" : "paused";
  },
};

let toastTimer = 0;

// Words for a screen reader alone (a polite live region, off the screen).
function announce(words) {
  let a = $(".announce");
  if (!a) {
    a = el("div", "announce");
    a.setAttribute("aria-live", "polite");
    document.body.appendChild(a);
  }
  a.textContent = words;
}

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

// ---- Listen: a recording, or the browser's voice, as core's session asks ----
// (The recording: an address played from one time to another, where it
// is told to core four times a second; its end and its failure too.)
const sound = {
  el: new Audio(),
  tok: 0,
  to: -1,
  timer: 0,
  held: "",
  // (kept:NAME, a chapter core holds: played from the cache, else it
  // fails, and core plays it from online.)
  async play(tok, from, to, rate, url) {
    voice.stop();
    this.stop();
    this.tok = tok;
    this.to = to;
    if (url.startsWith("kept:")) {
      const held = await heldAddress(url.slice(5));
      if (tok !== this.tok) {
        if (held) URL.revokeObjectURL(held);
        return;
      }
      if (!held) {
        this.failed(tok);
        return;
      }
      if (this.held) URL.revokeObjectURL(this.held);
      this.held = url = held;
    }
    const a = this.el;
    a.preload = "auto";
    a.src = url;
    a.playbackRate = rate;
    a.addEventListener("loadedmetadata", () => {
      if (from > 0) a.currentTime = from / 100;
    }, { once: true });
    a.play().catch(() => this.failed(tok));
    this.timer = setInterval(() => this.tell(), 250);
  },
  tell() {
    const a = this.el;
    const t = Math.round(a.currentTime * 100);
    if (this.to >= 0 && t >= this.to) {
      this.stop();
      send(`audioended ${this.tok}`);
      return;
    }
    if (!a.paused) send(`audiotime ${this.tok} ${t} ${Math.round((a.duration || 0) * 100)}`);
  },
  failed(tok) {
    if (tok !== this.tok) return;
    this.stop();
    send(`audiofailed ${tok}`);
  },
  pause() {
    this.el.pause();
  },
  resume() {
    if (this.el.src) this.el.play().catch(() => {});
  },
  stop() {
    clearInterval(this.timer);
    this.el.pause();
  },
};
sound.el.addEventListener("ended", () => {
  clearInterval(sound.timer);
  send(`audioended ${sound.tok}`);
});
sound.el.addEventListener("error", () => sound.failed(sound.tok));

const voice = {
  pause() {
    window.speechSynthesis?.pause();
  },
  resume() {
    window.speechSynthesis?.resume();
  },
  say(c, v, rate, words, name) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(words);
    u.lang = "en-US";
    const chosen = name && speechSynthesis.getVoices().find((x) => x.name === name);
    if (chosen) u.voice = chosen;
    u.rate = rate;
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

// The device's voices told to core (voices Q:LANG:NAME ...: quality 2 for
// the natural or premium ones, else 1), as they become known.
function tellVoices() {
  if (!window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices();
  if (!vs.length) return;
  const q = (v) => (/natural|neural|premium|enhanced/i.test(v.name) ? 2 : 1);
  send("voices\t" + vs.map((v) => `${q(v)}:${v.lang}:${v.name.replace(/[\t\n]/g, " ")}`).join("\t"));
}
if (window.speechSynthesis) speechSynthesis.addEventListener("voiceschanged", tellVoices);

// ---- reminders: shown at their time while the page is open (a page
// can't wake itself) ----
const reminders = {
  timers: [],
  clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  },
  // (Each opened: core's `reminded PLAN MEMORY`.)
  add(at, opens, title, body) {
    const ms = at * 1000 - Date.now();
    if (ms < 0 || ms > 2 ** 31 - 1 || !window.Notification) return;
    this.timers.push(setTimeout(() => {
      if (Notification.permission !== "granted") return;
      const n = new Notification(title, { body, icon: "/img/apple-touch-icon.png", tag: "daily" });
      n.onclick = () => {
        window.focus();
        n.close();
        send(`reminded ${opens}`);
      };
    }, ms));
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
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.classList.contains("keytrap");
  // (A screen that takes letters: each one typed, its code point, core's.)
  const top = panel.box.hidden ? null : panel.top();
  if (top && top.keys && !typing && !e.target.classList.contains("keytrap") && !e.ctrlKey && !e.metaKey && !e.altKey && [...e.key].length === 1 && e.key !== " ") {
    e.preventDefault();
    send(`act ${top.id} ${top.keys} ${e.key.codePointAt(0)} 0`);
    return;
  }
  const mods = (e.ctrlKey || e.metaKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0);
  if (typing && !(mods & 1)) return;
  // (Escape over the reader: the selection let go.)
  if (e.key === "Escape" && !typing && panel.box.hidden && !tray.box.hidden) {
    send("tapnone");
    return;
  }
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
  tellVoices();
  const c = chapterOfAddress(location.pathname);
  const v = /^\/read\/([a-z]+)\//.exec(location.pathname);
  if (v && ADDRESS_VERSIONS.includes(v[1])) send(`version ${v[1].toUpperCase()}`);
  if (c >= 0) send(`place ${c} 0 0`);
  // (The panel beside the page always fits: at its right on a wide
  // window, under it on a narrow one.)
  send("panelfits 1");
  send(`start ${innerWidth} ${innerHeight} ${Math.round(devicePixelRatio * 100)} ${matchMedia("(prefers-color-scheme: dark)").matches ? 1 : 0} ${-new Date().getTimezoneOffset() * 60}`);
  tellNetwork();
  addEventListener("online", tellNetwork);
  addEventListener("offline", tellNetwork);
  navigator.connection?.addEventListener?.("change", tellNetwork);
  // (Offline once visited, after the first paint: WEB.md §W9.1.)
  if ("serviceWorker" in navigator) setTimeout(offline, 3000);
}

// The Service Worker registered; the data read before it was there kept
// where it keeps the data (sw.js's sb-data-), from the browser's cache.
function offline() {
  navigator.serviceWorker.register("/read/sw.js", { scope: "/read/" }).catch(() => {});
  navigator.serviceWorker.ready.then(async () => {
    const c = await caches.open("sb-data-" + meta("sb-data"));
    for (const url of dataRead) if (!(await c.match(url))) await c.add(url).catch(() => {});
  });
}

// The browser asked to keep what is kept, once something of the reader's
// is (a highlight, a note, a ribbon...: not the settings or the ESV's
// chapters), where it decides without asking (WEB.md §W9.4).
let persistAsked = false;

function keepStorage(key) {
  if (persistAsked || /^sb\.(settings|voice|esv)/.test(key) || !navigator.storage?.persist) return;
  persistAsked = true;
  if (/firefox/i.test(navigator.userAgent)) return;
  navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
}

panel.init();
tray.init();
capsule.init();
player.init();
// (Which hand moved last, the keys or a pointer: the panel's Back focused
// by the page itself as a sheet opens shows its ring only to the keys.)
addEventListener("keydown", () => document.documentElement.classList.add("keys"), true);
addEventListener("pointerdown", () => document.documentElement.classList.remove("keys"), true);
// (The panel's entries are the browser's Back; the reader's place is
// core's, never the browser's restoring.)
history.scrollRestoration = "manual";
// (Where core's host finds the site's Worker.)
send(`api ${API}`);
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
// Core runs through a Reloader (RELOAD.md): once from the site's module;
// with ?dev (or ?dev=http://host:8777), from the hot reload server's builds,
// each reload starting core again over its persistent state, the skin's
// views reset first.
const DEV = new URLSearchParams(location.search).has("dev") ? new URLSearchParams(location.search).get("dev") || `http://${location.hostname}:8777` : null;
const core = new Reloader({
  sys,
  imports,
  run: (instance) => runResumable(instance, () => new Promise((r) => {
    if (inbox) r();
    else wakeUp = r;
  })).then((status) => core.isCurrent(instance) && console.warn("smooth bible stopped", status), (e) => console.error("smooth bible failed", e)),
  log: (m) => console.log("smooth bible reload:", m),
});

// The skin's own state let go, for core to say it all again.
function resetSkin() {
  inbox = "";
  wakeUp = null;
  files.clear();
  building = null;
  chapter = null;
  started = false;
  panel.dismiss();
  tray.hide();
  capsule.show("");
  player.hide();
  reminders.clear();
  for (const r of panes) {
    r.main.textContent = "";
    r.asked.clear();
    r.chapters.clear();
    r.pending = null;
    r.told = null;
    r.said = { c: -1 };
  }
  send(`api ${API}`);
}

if (DEV) {
  const first = await fetch(`${DEV}/build.wasm`, { cache: "no-store" });
  if (!first.ok) throw new Error(`smooth bible: no build at ${DEV} (${first.status})`);
  await core.load(new Uint8Array(await first.arrayBuffer()));
  const since = (await (await fetch(`${DEV}/build`, { cache: "no-store" })).json()).build;
  watchBuilds(DEV, async (bytes, info) => {
    if (!core.idle()) return console.warn("smooth bible: core busy; not reloaded");
    resetSkin();
    await core.load(bytes);
    console.log(`smooth bible: build ${info.build} running`);
  }, { since, log: (m) => console.warn("smooth bible dev:", m) });
} else core.load(await WebAssembly.compileStreaming(window.l8Prefetch?.[WASM] || fetch(WASM))).catch((e) => console.error("smooth bible failed", e));
