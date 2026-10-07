// The block game, alone on the page: load the module and run it on a canvas
// that fills the screen. The world file lives in an in-memory file system and
// is saved to localStorage whenever the game writes it. `?glcheck` reports
// failing GL calls on the console.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "./platform.js";
import { createTelemetry } from "./telemetry.js";
import { startControl } from "./control.js";

const WORLD = "/programs/block-game/world.txt";
const STORAGE_KEY = "l8-block-game-world";
// The game keeps the levels solved in play beside the world.
const PROGRESS = `${WORLD}.progress`;

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const show = (html) => {
  message.innerHTML = html;
  overlay.hidden = false;
};

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
  const params = new URLSearchParams(location.search);
  // ?world=FILE plays another world file, such as garden.txt, with its own
  // saved progress.
  const worldFile = params.get("world") || "world.txt";
  const storageKey = worldFile === "world.txt" ? STORAGE_KEY : `${STORAGE_KEY}:${worldFile}`;
  const [module, world] = await Promise.all([
    WebAssembly.compileStreaming(fetch("block-game.wasm")),
    fetch(worldFile).then((r) => r.text()),
  ]);
  // ?probe moves the player, so it starts from the original world and saves
  // nothing; so does ?fresh, for remote experiments.
  const probe = params.has("probe");
  const fresh = probe || params.has("fresh");
  const files = { [WORLD]: (!fresh && localStorage.getItem(storageKey)) || world };
  const progress = !fresh && localStorage.getItem(`${storageKey}:progress`);
  if (progress) files[PROGRESS] = progress;
  const fs = new MemFS(files);
  const decoder = new TextDecoder();
  fs.onOutput = (_fd, data) => console.log(decoder.decode(data).trimEnd());
  const sys = fs.sys(["block-game", "play", WORLD.slice(1)]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (!fresh && file?.writable && file.path === WORLD) localStorage.setItem(storageKey, decoder.decode(fs.readFile(WORLD)));
    if (!fresh && file?.writable && file.path === PROGRESS) localStorage.setItem(`${storageKey}:progress`, decoder.decode(fs.readFile(PROGRESS)));
    return status;
  };

  // ?scale=0.5 renders at half resolution instead of adapting; ?stats shows
  // the frame rate; ?fps opens the game's own frame-time view; ?L8_WATER_STATIC
  // and other L8_ parameters set the game's environment variables.
  // ?zoom=1.2 sets the least CSS pixels per game pixel: larger shows less
  // of the world, larger.
  const zoom = Math.min(4, Math.max(0.25, Number(params.get("zoom")) || 0.85));
  const fixedScale = params.has("scale") ? Math.min(1, Math.max(0.25, Number(params.get("scale")) || 1)) : null;
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  // Touch controls cover the bottom corners, so the room's name goes on top.
  if (touch) env.L8_TITLE_TOP = "1";
  const platform = createPlatform(canvas, {
    log: (text) => console.warn(text),
    checkErrors: params.has("glcheck"),
    countCalls: params.has("glstats"),
    // GL call timing for the telemetry, unless ?notelemetry.
    timing: !params.has("notelemetry"),
    // ?gputime also times those parts on the GPU, where it can.
    gpuTiming: params.has("gputime"),
    // ?skip=fb3,prog7 drops those draws, to measure what they cost.
    skip: new Set((params.get("skip") ?? "").split(",").filter(Boolean)),
    scale: fixedScale ?? 1,
    zoom,
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

  // Frame-time reports go to the page's server (see telemetry.js); ?probe
  // first measures what each part of a frame costs.
  const note = document.createElement("div");
  note.className = "note";
  note.hidden = true;
  document.body.append(note);
  const telemetry = params.has("notelemetry")
    ? null
    : createTelemetry(platform, {
        probe,
        show: (text) => {
          note.textContent = text ?? "";
          note.hidden = !text;
        },
      });
  // The development server can also send commands (see control.js).
  if (telemetry) startControl(platform, telemetry);
  const status = await runResumable(instance, pacer(platform, fixedScale === null, params.has("stats"), telemetry));
  canvas.blur();
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

// Wait for each frame, and adapt the render resolution: when frames are slow
// although the game's own work leaves time to spare, the GPU is the limit, so
// render fewer pixels, and keep doing so while that speeds frames up; when
// there is headroom again, render more. Frames slow from the game's own work
// (its code and GL calls) keep their size, since fewer pixels would not help.
function pacer(platform, adapt, stats, telemetry) {
  const STEPS = [1, 0.85, 0.72, 0.6, 0.5];
  let step = 0;
  let last = 0;
  let frames = 0;
  let elapsed = 0;
  let work0 = platform.workMs();
  let fast = 0;
  let slowRun = 0;
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
    telemetry?.frame(now);
    if (last) {
      elapsed += now - last;
      frames++;
    }
    last = now;
    if (frames < 30) return;
    const interval = elapsed / frames;
    const work = (platform.workMs() - work0) / frames;
    if (label) label.textContent = `${(1000 / interval).toFixed(0)} fps · work ${work.toFixed(1)} ms · ${Math.round(platform.scale() * 100)}%`;
    if (adapt && !telemetry?.probing()) {
      // A step down must speed frames up, or it only blurs the game (as when
      // the browser caps the frame rate, like iOS in Low Power Mode).
      if (before && interval > before * 0.97) {
        step--;
        floor = step;
      }
      before = 0;
      // Two slow windows in a row, so a brief burst does not blur the game.
      slowRun = interval > 22 && work < 0.6 * interval ? slowRun + 1 : 0;
      const slow = slowRun >= 2;
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
