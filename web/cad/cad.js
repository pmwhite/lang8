// The CAD editor (programs/cad) on a canvas that fills the screen, on the
// block game's browser implementation of X11, GLX, and OpenGL
// (../game/platform.js). The editor draws everything, its buttons
// included; the page only starts it, passes it fingers, keys and the
// phone's safe edges, and keeps the designs: the handheld and its dock,
// each a board file (/handheld.pcb, /dock.pcb), which the editor goes
// between from its title's menu and writes back after each change. The
// page saves each in localStorage with the version of the file it began
// from: when the site has a newer one, that is what opens (no stale edits
// to clear by hand). Keys from the page are 1000000000 + 1000 * what +
// number (see page_says in edit.l8).
//
// Opening another site, or saving a file, has to come from a tap on the
// page itself: so the editor says where its buttons for those are
// (CADLINKS n, then n lines CADLINK ID x0 y0 x1 y1 open URL, or ... save
// PATH NAME, in the editor's pixels; see order.l8), and the page lays unseen
// links over them. A file to save is read from the editor's files when
// tapped; and the editor is told which was tapped (6, ID), to say so.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";

const DESIGNS = ["handheld.pcb", "dock.pcb"];
const STORE = "cad:design:";

// A file's version: a short hash of its text.
const version = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
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
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.("#links a")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

async function main() {
  const params = new URLSearchParams(location.search);
  const [module, ...texts] = await Promise.all([
    WebAssembly.compileStreaming(fetch("cad.wasm")),
    ...DESIGNS.map((name) => fetch(name).then((r) => r.text())),
  ]);
  // Each design as last left here, if from this version of it; else as the
  // site has it.
  const files = {};
  const versions = {};
  DESIGNS.forEach((name, i) => {
    versions[`/${name}`] = version(texts[i]);
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE + name));
    } catch {}
    files[`/${name}`] = saved?.from === versions[`/${name}`] ? saved.text : texts[i];
  });
  localStorage.removeItem("cad:board");
  const fs = new MemFS(files);
  const decoder = new TextDecoder();
  let pending = "";
  fs.onOutput = (_fd, data) => {
    pending += decoder.decode(data);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (line.startsWith("CADLINK")) linkLine(line);
      else console.log(line);
    }
  };
  // The links the editor last said, laid over its buttons.
  let linkWords = [];
  let linksWanted = 0;
  const linkLine = (line) => {
    const w = line.split(" ");
    if (w[0] === "CADLINKS") {
      linkWords = [];
      linksWanted = Number(w[1]);
    } else linkWords.push(w.slice(1));
    if (linkWords.length === linksWanted) placeLinks();
  };
  const placeLinks = () => {
    const box = $("links");
    box.replaceChildren();
    const r = canvas.getBoundingClientRect();
    const k = r.width / platform.windowSize()[0];
    for (const [id, x0, y0, x1, y1, how, where, name] of linkWords) {
      const a = document.createElement("a");
      Object.assign(a.style, {
        left: `${r.left + x0 * k}px`, top: `${r.top + y0 * k}px`,
        width: `${(x1 - x0) * k}px`, height: `${(y1 - y0) * k}px`,
      });
      if (how === "open") {
        a.href = where;
        a.target = "_blank";
        a.rel = "noopener";
      } else {
        a.href = "#";
        a.download = name;
        a.addEventListener("click", () => {
          a.href = URL.createObjectURL(new Blob([fs.readFile(where)]));
          setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        });
      }
      // (The editor says what the tap did, as its own buttons do.)
      a.addEventListener("click", () => send(6, Number(id)));
      box.append(a);
    }
  };
  addEventListener("resize", () => setTimeout(placeLinks, 60));
  const sys = fs.sys(["cad", ...DESIGNS.map((name) => `/${name}`)]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path in versions) {
      const text = decoder.decode(fs.readFile(file.path));
      localStorage.setItem(STORE + file.path.slice(1), JSON.stringify({ from: versions[file.path], text }));
    }
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
