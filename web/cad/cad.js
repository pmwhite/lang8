// The CAD editor (programs/cad) on a canvas that fills the screen, on the
// block game's browser implementation of X11, GLX, and OpenGL
// (../game/platform.js). The editor draws everything, its buttons
// included; the page only starts it, passes it fingers, keys and the
// phone's safe edges, and keeps the board: the editor writes /board.pcb
// after each change, and the page saves it in localStorage.
//
// ?fresh starts from the handheld's board again (and keeps what is done
// from then on); ?board=FILE starts from another board file beside the
// page. Keys from the page are 1000000000 + 1000 * what + number (see
// page_says in edit.l8).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";

const BOARD = "/board.pcb";
const STORE = "cad:board";
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
  const [module, text] = await Promise.all([
    WebAssembly.compileStreaming(fetch("cad.wasm")),
    fetch(params.get("board") || "handheld.pcb").then((r) => r.text()),
  ]);
  const saved = !fresh && !params.has("board") && localStorage.getItem(STORE);
  const fs = new MemFS({ [BOARD]: saved || text });
  const decoder = new TextDecoder();
  let pending = "";
  fs.onOutput = (_fd, data) => {
    pending += decoder.decode(data);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) console.log(line);
  };
  const sys = fs.sys(["cad", BOARD]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === BOARD) localStorage.setItem(STORE, decoder.decode(fs.readFile(BOARD)));
    return status;
  };
  const env = { L8_PAGE: "1" };
  if (touch) env.L8_TOUCH = "1";
  for (const [k, v] of params) if (k.startsWith("L8_")) env[k] = v;
  sys.env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const platform = createPlatform(canvas, {
    log: (t) => console.warn(t),
    checkErrors: params.has("glcheck"),
    zoom: Number(params.get("zoom")) || 0.85,
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
  // The phone's own edges (its notch, its home bar), in the editor's pixels.
  const sendSafe = () => {
    const s = getComputedStyle($("safe"));
    const k = platform.windowSize()[1] / innerHeight;
    send(1, parseFloat(s.paddingTop) * k);
    send(2, parseFloat(s.paddingBottom) * k);
    send(3, parseFloat(s.paddingLeft) * k);
    send(4, parseFloat(s.paddingRight) * k);
  };
  addEventListener("resize", () => setTimeout(sendSafe, 50));
  sendSafe();
  send(5, 0);
  canvas.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("booting")));
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The editor stopped${status ? ` with status ${status}` : ""}.<br><a href="">Start again</a>`);
}

main().catch((e) => {
  console.error(e);
  document.body.classList.remove("booting");
  show(`The editor stopped: ${e.message}`);
});
