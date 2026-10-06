// Load the block game module and run it on the page's canvas. The world file
// lives in an in-memory file system and is saved to localStorage whenever the
// game writes it.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "./platform.js";

// Levels the page offers; each keeps its own saved copy.
const LEVELS = {
  world: { file: "world.txt", title: "World" },
  pond: { file: "pond.txt", title: "Pond" },
  grove: { file: "grove-demo.txt", title: "Canopy walk" },
};
const params = new URLSearchParams(location.search);
const level = LEVELS[params.get("level")] ? params.get("level") : "world";
const WORLD = `/programs/block-game/${LEVELS[level].file}`;
const STORAGE_KEY = level === "world" ? "l8-block-game-world" : `l8-block-game-${level}`;

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const logBox = document.getElementById("log");
const editing = params.has("edit");

const log = (text) => {
  logBox.textContent += text.endsWith("\n") ? text : text + "\n";
  logBox.scrollTop = logBox.scrollHeight;
};
const fail = (text) => {
  log(text);
  document.getElementById("logbox").open = true;
};
const show = (html) => {
  message.innerHTML = html;
  overlay.hidden = false;
};

const picker = document.getElementById("level");
for (const [key, { title }] of Object.entries(LEVELS)) picker.add(new Option(title, key, false, key === level));
picker.addEventListener("change", () => {
  const next = new URLSearchParams({ level: picker.value });
  if (editing) next.set("edit", "");
  location.search = next.toString().replace(/=$/, "");
});
const modeLink = document.getElementById("mode");
modeLink.href = `?level=${level}${editing ? "" : "&edit"}`;
if (editing) {
  modeLink.textContent = "Play";
  document.getElementById("hint").textContent = "Editor: keys are listed on screen; q quits";
}
// ---- layout: the largest 5:3 box that fits, and full screen ----

const stage = document.getElementById("stage");
function fit() {
  const box = stage.getBoundingClientRect();
  const scale = Math.min(box.width / canvas.width, box.height / canvas.height);
  canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
}
new ResizeObserver(fit).observe(stage);

// The Fullscreen API where there is one; otherwise (iPhone) hide the page
// around the game. Launched from the Home Screen, the game starts immersive.
const root = document.documentElement;
const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen) &&
  (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? false);
const setImmersive = (on) => {
  document.body.classList.toggle("immersive", on);
  fit();
};
document.getElementById("fullscreen").addEventListener("click", () => {
  if (canFullscreen) (root.requestFullscreen ?? root.webkitRequestFullscreen).call(root, { navigationUI: "hide" });
  setImmersive(true);
  canvas.focus();
});
document.getElementById("exit-immersive").addEventListener("click", () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
  setImmersive(false);
});
for (const name of ["fullscreenchange", "webkitfullscreenchange"]) {
  document.addEventListener(name, () => {
    if (!(document.fullscreenElement || document.webkitFullscreenElement)) setImmersive(false);
  });
}
if (navigator.standalone || matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) setImmersive(true);

// ---- touch: on-screen keys and swipes ----

const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const SHIFT = 65505;
// Set once the game is running.
let sendKey = null;
const press = (sym, text = "") => sendKey?.(2, sym, text);
const release = (sym) => sendKey?.(3, sym);

function enableTouch() {
  if (document.body.classList.contains("touch")) return;
  document.body.classList.add("touch");
  fit();
}
if (touch) enableTouch();
addEventListener("touchstart", enableTouch, { once: true, passive: true });

for (const key of document.querySelectorAll(".controls .key")) {
  const sym = Number(key.dataset.key);
  const text = key.dataset.text ?? "";
  const shifted = key.dataset.shift === "1";
  let held = false;
  const up = () => {
    if (!held) return;
    held = false;
    key.classList.remove("held");
    release(sym);
    if (shifted) release(SHIFT);
  };
  // Keys never take focus, so the game keeps it.
  key.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    key.setPointerCapture(e.pointerId);
    held = true;
    key.classList.add("held");
    if (shifted) press(SHIFT);
    press(sym, text);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) key.addEventListener(name, up);
}

// A swipe on the game moves one step.
let swipe = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") swipe = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  const sym = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 65361 : 65363) : (dy < 0 ? 65362 : 65364);
  press(sym);
  release(sym);
});

document.getElementById("reset").addEventListener("click", () => {
  if (!confirm(`Forget saved progress and edits to ${LEVELS[level].title}?`)) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

async function main() {
  const [module, world] = await Promise.all([
    WebAssembly.compileStreaming(fetch("block-game.wasm")),
    fetch(LEVELS[level].file).then((r) => r.text()),
  ]);
  const fs = new MemFS({ [WORLD]: localStorage.getItem(STORAGE_KEY) ?? world });
  const decoder = new TextDecoder();
  fs.onOutput = (_fd, data) => log(decoder.decode(data));
  const sys = fs.sys(["block-game", editing ? "edit" : "play", WORLD.slice(1)]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === WORLD) localStorage.setItem(STORAGE_KEY, decoder.decode(fs.readFile(WORLD)));
    return status;
  };

  const platform = createPlatform(canvas, { log: fail, checkErrors: params.has("glcheck") });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);

  sendKey = platform.key;
  // Keyboard players see when the game loses focus; touch controls do not need it.
  show(touch ? "Tap the game to start" : "Click the game to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => {
    if (!document.body.classList.contains("touch")) show("Click the game to continue");
  });
  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
    overlay.hidden = true;
  });
  canvas.focus();

  const status = await runResumable(instance, platform.nextFrame);
  canvas.blur();
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
  overlay.style.pointerEvents = "auto";
}

main().catch((e) => {
  fail(`${e.name}: ${e.message}`);
  show(`The game stopped: ${e.message}`);
});
