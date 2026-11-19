// Tumbledown on a canvas that fills the screen, on the block game's
// browser implementation of X11, GLX, and OpenGL (../game/platform.js).
//
// The game draws everything itself, its thumbs' pads too (see
// programs/tumbledown/hud.l8). What this page does for it: it passes on
// the page's L8_ parameters (?L8_SEED=3, ?L8_AUTO=1, ...), and says
// L8_TOUCH on a touch screen (or with ?touch).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";

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
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.("a")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has("touch");

async function main() {
  const params = new URLSearchParams(location.search);
  // (The game as it is with this script: fetched by the same ?v= as the
  // script was, if any.)
  const module = await WebAssembly.compileStreaming(fetch(`tumbledown.wasm${new URL(import.meta.url).search}`));
  const fs = new MemFS({});
  const decoder = new TextDecoder();
  let written = "";
  fs.onOutput = (_fd, data) => {
    written += decoder.decode(data);
    const lines = written.split("\n");
    written = lines.pop();
    for (const line of lines) if (line.trim()) console.log(line.trimEnd());
  };
  const sys = fs.sys(["tumbledown"]);
  params.set("L8_PAGE", "1");
  if (touch) params.set("L8_TOUCH", "1");
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const platform = createPlatform(canvas, {
    log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale: 1, zoom: 0.85, env, pointers: true, maxTall: 2.4, maxPixels: 2.2e6,
    // Edges smoothed (?aa=0 leaves that out), and fragments shaded at
    // medium precision, far faster on a phone's GPU, as skate's page does
    // (the shaders keep full precision where it shows: HP in
    // programs/tumbledown/render.l8); ?precision=highp to compare.
    antialias: params.get("aa") !== "0",
    fragmentPrecision: params.get("precision") === "highp" ? "highp" : "mediump" });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  overlay.hidden = true;
  addEventListener("pointerdown", () => canvas.focus());
  // A finger on the screen when the phone takes the page away may never
  // be heard to lift, and he would go on gathering by it: so when the page
  // is left, each finger still down is let go.
  const down = new Map();
  const keep = (e) => down.set(e.pointerId, e.clientX);
  addEventListener("pointerdown", keep, true);
  addEventListener("pointermove", (e) => down.has(e.pointerId) && keep(e), true);
  for (const name of ["pointerup", "pointercancel"]) addEventListener(name, (e) => down.delete(e.pointerId), true);
  const letGo = () => {
    for (const [pointerId, clientX] of [...down]) dispatchEvent(new PointerEvent("pointercancel", { pointerId, clientX, clientY: 1e5 }));
  };
  addEventListener("blur", letGo);
  addEventListener("pagehide", letGo);
  document.addEventListener("visibilitychange", () => document.hidden && letGo());
  canvas.focus();
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Run again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
