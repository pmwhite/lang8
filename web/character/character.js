// The character viewer (programs/character) on a canvas that fills the
// screen, on the block game's browser implementation of X11, GLX, and OpenGL
// (../game/platform.js), with a page round it: the poses, the layers and
// their parts, the views, and the figure's text to change and read again.
//
// The viewer writes lines that start `CHR` (see tell_figure in main.l8) and
// takes commands as key codes: 1000000000 + 1000 * command + number.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";

const FIGURE = "/programs/character/running-back.txt";
const $ = (id) => document.getElementById(id);
const canvas = $("screen");
const overlay = $("overlay");
const show = (html) => {
  $("message").innerHTML = html;
  overlay.hidden = false;
};

for (const name of ["gesturestart", "gesturechange", "dblclick"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
// (Touches on the picture are the viewer's; those on the page's own parts
// scroll and type as usual.)
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.(".ui")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

let send = () => {};
const CMD = { show: 1, toggle: 2, layer: 3, part: 4, kind: 5, bones: 6, reload: 7, raw: 8, zoom: 9, detail: 10, shiftX: 11, shiftY: 12, freeW: 13, freeH: 14 };
const NONE = 999;

// ---- what the viewer has told the page ----
const figure = { layers: [], parts: [], poses: [], anims: [], routes: [], takes: [], steered: new Set() };
const state = { showing: 0, layer: -1, part: -1, hidden: new Set(), tab: null, baking: false, bakeMs: 0 };
let original = "";
let fs = null;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pretty = (name) => name.replace(/_/g, " ");

function drawPoses() {
  $("route-head").hidden = $("route-list").hidden = figure.routes.length === 0;
  $("take-head").hidden = $("take-list").hidden = figure.takes.length === 0;
  for (const [list, items] of [[$("pose-list"), figure.poses], [$("anim-list"), figure.anims], [$("route-list"), figure.routes], [$("take-list"), figure.takes]]) {
    list.replaceChildren(...items.map((p) => {
      const b = el("button", "chip" + (p.id === state.showing ? " on" : ""), pretty(p.name));
      b.onclick = () => {
        state.showing = p.id;
        send(CMD.show, p.id);
        drawPoses();
        // (Steering him wants the whole picture, and the keys.)
        if (figure.steered.has(p.id)) openTab(null);
        canvas.focus({ preventScroll: true });
      };
      return b;
    }));
  }
}

function drawLayers() {
  const rows = [];
  for (const layer of figure.layers) {
    const li = el("li", state.layer === layer.id && state.part < 0 ? "on" : "");
    const eye = el("button", "eye" + (state.hidden.has(layer.id) ? " off" : ""), "◉");
    eye.title = "Show or hide";
    eye.onclick = () => {
      if (state.hidden.has(layer.id)) state.hidden.delete(layer.id);
      else state.hidden.add(layer.id);
      send(CMD.toggle, layer.id);
      drawLayers();
    };
    const name = el("button", "name", pretty(layer.name));
    name.onclick = () => {
      const again = state.layer === layer.id && state.part < 0;
      state.layer = again ? -1 : layer.id;
      state.part = -1;
      send(CMD.layer, again ? NONE : layer.id);
      drawLayers();
    };
    const count = el("span", "count", layer.verts ? `${layer.verts.toLocaleString()} v` : "");
    li.append(eye, name, count, gotoButton(layer.line));
    rows.push(li);
    if (state.layer !== layer.id) continue;
    for (const part of figure.parts.filter((p) => p.layer === layer.id)) {
      const row = el("li", "part" + (state.part === part.id ? " on" : ""));
      const pn = el("button", "name", pretty(part.name));
      pn.onclick = () => {
        const again = state.part === part.id;
        state.part = again ? -1 : part.id;
        send(again ? CMD.layer : CMD.part, again ? layer.id : part.id);
        drawLayers();
      };
      row.append(pn, gotoButton(part.line));
      rows.push(row);
    }
  }
  $("layer-list").replaceChildren(...rows);
}

// A button that opens the text at a line.
function gotoButton(line) {
  const b = el("button", "goto", "↗");
  b.title = "Its lines in the text";
  b.onclick = () => {
    openTab("text");
    gotoLine(line);
  };
  return b;
}

function gotoLine(line) {
  const area = $("source");
  const lines = area.value.split("\n");
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  area.focus({ preventScroll: true });
  area.setSelectionRange(start, start + (lines[line - 1] ?? "").length);
  const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 17;
  area.scrollTop = Math.max(0, (line - 3) * lineHeight);
}

// ---- tabs ----
// The page covers parts of the picture: the title along the top, the tabs,
// and the open sheet. The viewer fits the figure to the middle of what is
// left, told where that is (in half screens from the middle) and how much
// of the picture it is.
function placeFigure() {
  const sheet = state.tab ? $(state.tab) : null;
  const wide = innerWidth > innerHeight;
  let left = 0, top = 56 / innerHeight, bottom = 0;
  if (sheet && wide) left = sheet.getBoundingClientRect().width / innerWidth;
  else if (sheet) bottom = (innerHeight - sheet.getBoundingClientRect().top) / innerHeight;
  else if (!wide) bottom = document.querySelector(".tabs").getBoundingClientRect().height / innerHeight;
  if (wide) top = 0;
  send(CMD.shiftX, Math.round(500 + 500 * left));
  send(CMD.shiftY, Math.round(500 + 500 * (bottom - top)));
  send(CMD.freeW, Math.round(999 * (1 - left)));
  send(CMD.freeH, Math.round(999 * (1 - top - bottom)));
}

function openTab(tab) {
  state.tab = tab;
  for (const name of ["poses", "parts", "view", "text"]) $(name).hidden = name !== tab;
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.tab === tab);
  document.body.classList.toggle("open", !!tab);
  placeFigure();
}
for (const b of document.querySelectorAll(".tabs button")) {
  b.onclick = () => openTab(state.tab === b.dataset.tab ? null : b.dataset.tab);
}
addEventListener("resize", placeFigure);

// A row of buttons of which one is on.
function segment(id, key, pick) {
  const buttons = [...$(id).querySelectorAll("button")];
  for (const b of buttons) {
    b.onclick = () => {
      for (const o of buttons) o.classList.toggle("on", o === b);
      pick(Number(b.dataset[key]));
    };
  }
  return (value) => {
    for (const o of buttons) o.classList.toggle("on", Number(o.dataset[key]) === value);
  };
}
segment("kinds", "kind", (k) => send(CMD.kind, k));
segment("bones", "on", (on) => send(CMD.bones, on));
segment("raw", "on", (on) => send(CMD.raw, on));
const setDetail = segment("detail", "detail", (d) => send(CMD.detail, d));

// ---- the viewer's lines ----
function heard(line) {
  const words = line.split(" ");
  if (words[0] !== "CHR") {
    console.log(line);
    return;
  }
  const rest = (n) => words.slice(n).join(" ");
  if (words[1] === "figure") {
    figure.layers = [];
    figure.parts = [];
    figure.poses = [];
    figure.anims = [];
    figure.routes = [];
    figure.takes = [];
    figure.steered = new Set();
    state.hidden.clear();
    state.baking = true;
    state.bakeMs = 0;
    $("title").textContent = rest(2) || "Character";
    document.title = rest(2) || "L8 Character";
    $("fault").hidden = true;
    $("status").textContent = "Baking…";
  } else if (words[1] === "baking") {
    state.baking = true;
    state.bakeMs = 0;
    $("status").textContent = "Baking\u2026";
  } else if (words[1] === "layer") figure.layers.push({ id: +words[2], line: +words[3], name: rest(4), verts: 0 });
  else if (words[1] === "part") figure.parts.push({ id: +words[2], layer: +words[3], line: +words[4], name: rest(5) });
  else if (words[1] === "pose") figure.poses.push({ id: +words[2], line: +words[3], name: rest(4) });
  else if (words[1] === "anim") figure.anims.push({ id: +words[2], line: +words[3], name: rest(4) });
  else if (words[1] === "route") figure.routes.push({ id: +words[2], line: +words[3], name: rest(4) });
  else if (words[1] === "steered") figure.steered.add(+words[2]);
  else if (words[1] === "take") figure.takes.push({ id: +words[2], line: +words[3], name: rest(4) });
  else if (words[1] === "bones") {
    if (state.showing >= figure.poses.length + figure.anims.length + figure.routes.length + figure.takes.length) state.showing = 0;
    if (!figure.layers.some((l) => l.id === state.layer)) state.layer = -1;
    state.part = -1;
    drawPoses();
    drawLayers();
  } else if (words[1] === "baked") {
    const layer = figure.layers.find((l) => l.id === +words[2]);
    if (layer) {
      layer.verts = +words[3];
      state.bakeMs += +words[5];
      $("status").textContent = `Baking… ${pretty(layer.name)}`;
    }
  } else if (words[1] === "ready") {
    state.baking = false;
    overlay.hidden = true;
    const text = `${(+words[2]).toLocaleString()} vertices · ${(+words[3]).toLocaleString()} triangles shown`;
    $("status").textContent = text;
    $("mesh-note").textContent = `${text}, baked in ${(state.bakeMs / 1000).toFixed(1)} s. A finer mesh takes longer to bake and to draw.`;
    drawLayers();
  } else if (words[1] === "error") {
    const fault = $("fault");
    fault.textContent = `Line ${words[2]}: ${rest(3)}`;
    fault.hidden = false;
    fault.onclick = () => {
      openTab("text");
      gotoLine(+words[2]);
    };
    $("status").textContent = "";
    overlay.hidden = true;
  }
}

// ---- the text ----
$("apply").onclick = () => {
  fs.writeFile(FIGURE, $("source").value);
  $("text-note").textContent = "";
  send(CMD.reload, 0);
};
$("revert").onclick = () => {
  $("source").value = original;
  $("apply").onclick();
};
$("source").addEventListener("input", () => ($("text-note").textContent = "Changed: Apply to see it"));
// (Keys typed in the text are the text's.)
$("source").addEventListener("keydown", (e) => e.stopPropagation());

async function main() {
  const params = new URLSearchParams(location.search);
  const [module, text] = await Promise.all([
    WebAssembly.compileStreaming(fetch("character.wasm")),
    fetch(params.get("figure") || "running-back.txt").then((r) => r.text()),
  ]);
  original = text;
  $("source").value = text;
  // The files the figure names on `use` lines (motion libraries), beside it.
  const files = { [FIGURE]: text };
  const dir = FIGURE.slice(0, FIGURE.lastIndexOf("/") + 1);
  const uses = [...text.matchAll(/^\s*use\s+(\S+)/gm)].map((m) => m[1]);
  for (const [name, body] of await Promise.all(uses.map(async (name) => [name, await (await fetch(name)).text()]))) {
    files[dir + name] = body;
  }
  fs = new MemFS(files);
  const decoder = new TextDecoder();
  let pending = "";
  fs.onOutput = (_fd, data) => {
    pending += decoder.decode(data);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) heard(line);
  };
  // A phone bakes and draws a coarser mesh unless asked.
  const detail = Number(params.get("detail")) || (touch ? 150 : 100);
  setDetail(detail);
  const env = { L8_PAGE: "1", L8_DETAIL: String(detail / 100) };
  for (const [k, v] of params) if (k.startsWith("L8_")) env[k] = v;
  const sys = fs.sys(["character"]);
  sys.env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const platform = createPlatform(canvas, { log: (t) => console.warn(t), checkErrors: params.has("glcheck"), scale: 1, zoom: 0.85, env, pointers: true, maxTall: 2.4, maxPixels: 2.6e6, antialias: true });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  send = (command, number) => platform.key(2, 1000000000 + 1000 * command + number);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    send(CMD.zoom, e.deltaY < 0 ? 25 : 75);
  }, { passive: false });
  show("Baking the figure&hellip;");
  placeFigure();
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The viewer exited${status ? ` with status ${status}` : ""}.<br><a href="">Start again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The viewer stopped: ${e.message}`);
});
