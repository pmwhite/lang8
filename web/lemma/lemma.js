// Lemma (programs/lemma), the proof game, on a canvas that fills the
// screen, on the block game's browser implementation of X11, GLX and
// OpenGL (../game/platform.js). The game draws everything; the page only
// starts it, gives it its theory files (the logic and the regions, fetched
// and put where the game reads them), passes it fingers, keys and the
// phone's safe edges, and keeps what has been proved: the game writes
// /progress.txt when a level is proved, and the page keeps it in
// localStorage.
//
// ?fresh starts with nothing proved (not kept). L8_ query parameters are
// passed to the game's environment (L8_LEVEL=9&L8_WATCH=1 opens a level
// and plays its proof; L8_KEYS and L8_TAPS play it, as in the README).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";

const PROGRESS = "/progress.txt";
const STORE = "lemma:progress";
const FILES = ["hol.txt", "regions/logic.txt", "regions/groups.txt", "regions/analysis.txt"];
const $ = (id) => document.getElementById(id);
const canvas = $("screen");
const show = (html) => {
  $("message").innerHTML = html;
  $("overlay").hidden = false;
};

for (const name of ["gesturestart", "gesturechange", "dblclick", "contextmenu"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

async function main() {
  const params = new URLSearchParams(location.search);
  const fresh = params.has("fresh");
  const [module, ...texts] = await Promise.all([
    WebAssembly.compileStreaming(fetch("lemma.wasm")),
    ...FILES.map((f) => fetch(f).then((r) => r.text())),
  ]);
  const files = { [PROGRESS]: fresh ? "" : localStorage.getItem(STORE) || "" };
  FILES.forEach((f, i) => (files[`programs/lemma/${f}`] = texts[i]));
  const fs = new MemFS(files);
  const decoder = new TextDecoder();
  let pending = "";
  fs.onOutput = (_fd, data) => {
    pending += decoder.decode(data);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) console.log(line);
  };
  const sys = fs.sys(["lemma", PROGRESS]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === PROGRESS && !fresh) localStorage.setItem(STORE, decoder.decode(fs.readFile(PROGRESS)));
    return status;
  };
  const env = { L8_PAGE: "1" };
  if (touch) env.L8_TOUCH = "1";
  for (const [k, v] of params) if (k.startsWith("L8_")) env[k] = v;
  sys.env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const platform = createPlatform(canvas, {
    log: (t) => console.warn(t),
    checkErrors: params.has("glcheck"),
    zoom: 0.85,
    env,
    pointers: true,
    wheel: true,
    maxTall: 2.4,
    maxPixels: 3.2e6,
  });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  const send = (what, n) => platform.key(2, 1000000000 + 1000 * what + Math.max(0, Math.min(999, Math.round(n))));

  // The game's pixels are the page's: how many window pixels to one, and
  // the phone's own edges (its notch, its home bar), told when they change.
  let told = "";
  const sendSafe = () => {
    const s = getComputedStyle($("safe"));
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const k = Math.round((platform.windowSize()[0] / width) * 500);
    const edges = ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"].map((p) => Math.round(parseFloat(s[p]) || 0));
    const now = [k, ...edges].join(" ");
    if (now === told) return;
    told = now;
    send(5, k);
    edges.forEach((v, i) => send(1 + i, v));
  };
  const watch = () => {
    sendSafe();
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  sendSafe();

  canvas.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("booting")));
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game stopped${status ? ` with status ${status}` : ""}.<br><a href="">Start again</a>`);
}

main().catch((e) => {
  console.error(e);
  document.body.classList.remove("booting");
  show(`The game stopped: ${e.message}`);
});
