// The block game, alone on the page: load the module and run it on a canvas
// that fills the screen. The world file lives in an in-memory file system and
// is saved to localStorage whenever the game writes it. `?glcheck` reports
// failing GL calls on the console.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "./platform.js";

const WORLD = "/programs/block-game/world.txt";
const STORAGE_KEY = "l8-block-game-world";

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const show = (html) => {
  message.innerHTML = html;
  overlay.hidden = false;
};

// ---- layout: the largest 5:3 box that fits ----

function fit() {
  const scale = Math.min(innerWidth / canvas.width, innerHeight / canvas.height);
  canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
}
addEventListener("resize", fit);
fit();

// ---- touch: no browser gestures, on-screen keys, and swipes ----

// Safari ignores user-scalable=no, so cancel its gestures and the second of
// two quick taps, which would zoom.
for (const name of ["gesturestart", "gesturechange", "dblclick"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
let lastTouch = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = e.timeStamp;
    if (now - lastTouch < 400) e.preventDefault();
    lastTouch = now;
  },
  { passive: false },
);

const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const SHIFT = 65505;
const F3 = 65472;
// Set once the game is running.
let sendKey = null;
const press = (sym, text = "") => sendKey?.(2, sym, text);
const release = (sym) => sendKey?.(3, sym);

if (touch) document.body.classList.add("touch");
addEventListener("touchstart", () => document.body.classList.add("touch"), { once: true, passive: true });

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

// ---- the game ----

async function main() {
  const [module, world] = await Promise.all([
    WebAssembly.compileStreaming(fetch("block-game.wasm")),
    fetch("world.txt").then((r) => r.text()),
  ]);
  const fs = new MemFS({ [WORLD]: localStorage.getItem(STORAGE_KEY) ?? world });
  const decoder = new TextDecoder();
  fs.onOutput = (_fd, data) => console.log(decoder.decode(data).trimEnd());
  const sys = fs.sys(["block-game", "play", WORLD.slice(1)]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === WORLD) localStorage.setItem(STORAGE_KEY, decoder.decode(fs.readFile(WORLD)));
    return status;
  };

  // ?scale=0.5 renders at half resolution instead of adapting; ?stats shows
  // the frame rate; ?fps opens the game's own frame-time view; ?L8_WATER_STATIC
  // and other L8_ parameters set the game's environment variables.
  const params = new URLSearchParams(location.search);
  const fixedScale = params.has("scale") ? Math.min(1, Math.max(0.25, Number(params.get("scale")) || 1)) : null;
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const platform = createPlatform(canvas, {
    log: (text) => console.warn(text),
    checkErrors: params.has("glcheck"),
    countCalls: params.has("glstats") || params.has("skip"),
    // ?skip=fb3,prog7 drops those draws, to measure what they cost.
    skip: new Set((params.get("skip") ?? "").split(",").filter(Boolean)),
    scale: fixedScale ?? 1,
    env,
  });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  sendKey = platform.key;
  // ?fps opens the game's frame-time view, as F3 does.
  if (params.has("fps")) {
    press(F3);
    release(F3);
  }

  // Keyboard players see when the game loses focus; touch controls do not need it.
  show(touch ? "Tap to start" : "Click to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => {
    if (!document.body.classList.contains("touch")) show("Click to continue");
  });
  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
    overlay.hidden = true;
  });
  canvas.focus();

  const status = await runResumable(instance, pacer(platform, fixedScale === null, params.has("stats")));
  canvas.blur();
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

// Wait for each frame, and adapt the render resolution: when frames are slow
// although the game's own work leaves time to spare, the GPU is the limit, so
// render fewer pixels; when there is headroom again, render more.
function pacer(platform, adapt, stats) {
  const STEPS = [1, 0.85, 0.72, 0.6, 0.5];
  let step = 0;
  let last = 0;
  let frames = 0;
  let elapsed = 0;
  let work0 = platform.workMs();
  let fast = 0;
  // The interval before the last step down, and the lowest useful step.
  let before = 0;
  let floor = STEPS.length - 1;
  const label = stats ? document.createElement("div") : null;
  if (label) {
    label.style.cssText = "position:fixed;top:max(6px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));" +
      "font:12px ui-monospace,Menlo,monospace;color:#cfd6e4;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:4px";
    document.body.append(label);
  }
  return async () => {
    await platform.nextFrame();
    const now = performance.now();
    if (last) {
      elapsed += now - last;
      frames++;
    }
    last = now;
    if (frames < 30) return;
    const interval = elapsed / frames;
    const work = (platform.workMs() - work0) / frames;
    if (label) label.textContent = `${(1000 / interval).toFixed(0)} fps · cpu ${work.toFixed(1)} ms · ${Math.round(platform.scale() * 100)}%`;
    if (adapt) {
      // A step down must speed frames up, or it only blurs the game (as when
      // the browser caps the frame rate, like iOS in Low Power Mode).
      if (before && interval > before * 0.97) {
        step--;
        floor = step;
      }
      before = 0;
      const slow = interval > 22 && work < 0.6 * interval;
      fast = interval < 18 ? fast + 1 : 0;
      if (slow && step < floor) {
        before = interval;
        step++;
      } else if (fast >= 4 && step > 0) {
        step--;
        fast = 0;
      }
      platform.setScale(STEPS[step]);
    }
    frames = 0;
    elapsed = 0;
    work0 = platform.workMs();
  };
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
