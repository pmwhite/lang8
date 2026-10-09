// The skate game on a canvas that fills the screen. It shares the block
// game's browser implementation of X11, GLX, and OpenGL (../game/platform.js).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";
import { startControl } from "../game/control.js";

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const show = (html) => {
  message.innerHTML = html;
  overlay.hidden = false;
};

for (const name of ["gesturestart", "gesturechange", "dblclick"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
// The whole screen is a control surface: no scrolling, zooming, or (as far
// as a page can stop it) swiping back. If a swipe back gets through anyway,
// it lands on this same page, which steps forward again.
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.("a, #guide")) e.preventDefault();
  }, { passive: false });
}
history.pushState({ stay: true }, "", location.href);
addEventListener("popstate", () => history.pushState({ stay: true }, "", location.href));

const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add("touch");
// The game starts on the course, where the screen itself is the controls;
// in the park, the arrow pad and buttons are. The mode button (Tab) goes
// between them.
const modeKey = document.querySelector(".key.mode");
const setMode = (course) => {
  document.body.classList.toggle("course", course);
  modeKey.textContent = course ? "Park" : "Course";
};
setMode(true);
let sendKey = null;
for (const key of document.querySelectorAll(".controls .key")) {
  const sym = Number(key.dataset.key);
  if (key === modeKey) key.addEventListener("pointerdown", () => setMode(!document.body.classList.contains("course")));
  let held = false;
  const up = () => {
    if (!held) return;
    held = false;
    key.classList.remove("held");
    sendKey?.(3, sym);
  };
  key.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    key.setPointerCapture(e.pointerId);
    held = true;
    key.classList.add("held");
    sendKey?.(2, sym, "");
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) key.addEventListener(name, up);
}

// The guide to the course: the How button opens it, and the game pauses
// (holding Pause) until it closes, with its button, a tap outside it, or
// Escape.
const guide = document.getElementById("guide");
const openGuide = () => {
  guide.hidden = false;
  canvas.blur();
  sendKey?.(2, 65299, "");
};
const closeGuide = () => {
  guide.hidden = true;
  sendKey?.(3, 65299);
  canvas.focus();
};
document.querySelector(".how").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  openGuide();
});
guide.addEventListener("pointerdown", (e) => {
  if (e.target === guide || e.target.closest(".close")) {
    e.preventDefault();
    closeGuide();
  }
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !guide.hidden) closeGuide();
});

async function main() {
  const params = new URLSearchParams(location.search);
  const module = await WebAssembly.compileStreaming(fetch("skate.wasm"));
  const fs = new MemFS({});
  const decoder = new TextDecoder();
  fs.onOutput = (_fd, data) => console.log(decoder.decode(data).trimEnd());
  const sys = fs.sys(["skate"]);
  // L8_ parameters are also the game's environment (as L8_SPAWN=col,row,dir).
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const zoom = Math.min(4, Math.max(0.25, Number(params.get("zoom")) || 0.85));
  const scale = params.has("scale") ? Math.min(1, Math.max(0.25, Number(params.get("scale")) || 1)) : 1;
  const platform = createPlatform(canvas, { log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale, zoom, env, pointers: true, maxTall: 2.4,
    // ?gputime times the frame's parts on the GPU (l8Game.glTiming().gpu);
    // ?skip=prog3 drops a program's draws, to measure what they cost.
    timing: params.has("gputime"), gpuTiming: params.has("gputime"),
    skip: new Set((params.get("skip") ?? "").split(",").filter(Boolean)) });
  // Tab on a keyboard switches too.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "Tab" && !e.repeat) setMode(!document.body.classList.contains("course"));
  });
  // The steering and trick panels, placed over the game's view where the
  // game reads them: these fractions match programs/skate/touch.l8.
  const STEER_LEFT = 0.04, STEER_RIGHT = 0.47, PANEL_TOP = 0.52, PANEL_BOTTOM = 0.8;
  const steerPanel = document.querySelector(".panel.steer");
  const trickPanel = document.querySelector(".panel.trick");
  const placePads = () => {
    const r = canvas.getBoundingClientRect();
    const place = (el, left, right) => {
      el.style.left = `${r.left + r.width * left}px`;
      el.style.width = `${r.width * (right - left)}px`;
      el.style.top = `${r.top + r.height * PANEL_TOP}px`;
      el.style.height = `${r.height * (PANEL_BOTTOM - PANEL_TOP)}px`;
    };
    place(steerPanel, STEER_LEFT, STEER_RIGHT);
    place(trickPanel, 1 - STEER_RIGHT, 1 - STEER_LEFT);
  };
  new ResizeObserver(placePads).observe(canvas);
  addEventListener("resize", placePads);
  placePads();
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  sendKey = platform.key;
  show(touch ? "Tap to start" : "Click to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => {
    if (!touch && guide.hidden) show("Click to continue");
  });
  addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".ui")) return;
    canvas.focus();
    overlay.hidden = true;
  });
  canvas.focus();
  // ?control lets web/control.py drive the page (see ../game/control.js).
  if (params.has("control")) {
    const session = Math.random().toString(36).slice(2, 10);
    const post = (kind, data) =>
      fetch("/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session, kind, t: Date.now(), ...data }) });
    startControl(platform, { session, post, reportNow: () => null });
  }
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
