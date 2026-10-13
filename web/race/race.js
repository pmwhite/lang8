// The racing game on a canvas that fills the screen, on the block game's
// browser implementation of X11, GLX, and OpenGL (../game/platform.js).
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
    if (!e.target.closest?.("a, button")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add("touch");

async function main() {
  const params = new URLSearchParams(location.search);
  const module = await WebAssembly.compileStreaming(fetch("race.wasm"));
  const fs = new MemFS({});
  const decoder = new TextDecoder();
  fs.onOutput = (_fd, data) => console.log(decoder.decode(data).trimEnd());
  const sys = fs.sys(["race"]);
  // The car last driven here is the one to start in (the game's L8_CAR),
  // unless the address says which.
  const CARS = 4;
  const stored = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  let car = Number(params.get("L8_CAR") ?? stored("race.car") ?? 0);
  if (!(car >= 0 && car < CARS)) car = 0;
  params.set("L8_CAR", String(car));
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const platform = createPlatform(canvas, { log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale: 1, zoom: 0.85, env, pointers: true, maxTall: 2.4, maxPixels: 2.2e6 });
  // The steering panel and the pedals, placed over the game's view where
  // the game reads them: these fractions match programs/race/touch.l8.
  const STEER_LEFT = 0.04, STEER_RIGHT = 0.47, PANEL_TOP = 0.52, PANEL_BOTTOM = 0.8, PEDAL_SPLIT = 0.72;
  const steerPanel = document.querySelector(".panel.steer");
  const brakePanel = document.querySelector(".panel.brake");
  const gasPanel = document.querySelector(".panel.gas");
  const placePads = () => {
    const r = canvas.getBoundingClientRect();
    const place = (el, left, right) => {
      el.style.left = `${r.left + r.width * left}px`;
      el.style.width = `${r.width * (right - left)}px`;
      el.style.top = `${r.top + r.height * PANEL_TOP}px`;
      el.style.height = `${r.height * (PANEL_BOTTOM - PANEL_TOP)}px`;
    };
    place(steerPanel, STEER_LEFT, STEER_RIGHT);
    place(brakePanel, 1 - STEER_RIGHT, PEDAL_SPLIT - 0.01);
    place(gasPanel, PEDAL_SPLIT + 0.01, 1 - STEER_LEFT);
  };
  new ResizeObserver(placePads).observe(canvas);
  addEventListener("resize", placePads);
  placePads();
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  // Start over: the game's R key. The next car: its keys 1 to 4. (The
  // keyboard's own 1 to 4 and Tab are remembered the same way.)
  const press = (sym) => {
    platform.key(2, sym);
    platform.key(3, sym);
    canvas.focus();
  };
  const choose = (k) => {
    car = k;
    try {
      localStorage.setItem("race.car", String(car));
    } catch {}
  };
  document.getElementById("again").addEventListener("click", () => press(114));
  document.getElementById("car").addEventListener("click", () => {
    choose((car + 1) % CARS);
    press(49 + car);
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.key >= "1" && e.key <= String(CARS)) choose(Number(e.key) - 1);
    if (e.key === "Tab") choose((car + 1) % CARS);
  });
  show(touch ? "Tap to start" : "Click to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => {
    if (!touch) show("Click to continue");
  });
  addEventListener("pointerdown", (e) => {
    if (e.target.closest?.("a")) return;
    canvas.focus();
    overlay.hidden = true;
  });
  canvas.focus();
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
