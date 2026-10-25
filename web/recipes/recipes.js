// The recipe book (programs/recipes) on a canvas that fills the screen, on
// the block game's browser implementation of X11, GLX, and OpenGL
// (../game/platform.js). The book draws everything, its buttons and search
// fields included; the page only starts it, passes it fingers, keys, the
// phone's safe edges, today's date and the hour, and keeps the kitchen
// (what there is to eat where, and what was eaten): the book writes
// /kitchen.txt after each change, and the page saves it in localStorage
// and, with a personal link (#me=SECRET), to the kitchen's worker
// (../recipe-book/worker.js), so that it is kept, and is the same on every
// device that has the link. A kitchen saved from another device is put in
// the book's file when this page is looked at again, and the book told to
// read it (10). The book is told how the kitchen is kept (11): on this
// device only (0), saved (1), being saved (2), offline (3), or on this
// device only because its link is not one the worker knows (4).
//
// A search field is drawn by the book, but a phone's keyboard comes up only
// for a real text field touched by a finger: so the book says where its
// field is and what is written in it (L8FIELD x0 y0 x1 y1 TEXT, in CSS
// pixels from the canvas's corner, or L8FIELD -), and an unseen <input>
// is laid over it. What is typed there
// goes to the book as keys; the book says L8BLUR when it is done with it.
//
// ?fresh starts with an empty kitchen (not saved anywhere until changed);
// ?api=URL uses another worker (a local one). Keys from the page are
// 1000000000 + 1000 * what + number (see page_says in book.l8).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";
import { showAppRecovery } from "../app-recovery.js";

const KITCHEN = "/kitchen.txt";
const BOOK = "/recipes.txt";
const STORE = "recipes:kitchen";
// The person's secret; the worker's rev the kitchen here was last the
// same as; whether it has been changed here since; and when.
const ME = "recipes:me";
const REV = "recipes:rev";
const DIRTY = "recipes:dirty";
const EDITED = "recipes:edited";
const ASIDE = "recipes:set-aside";
const $ = (id) => document.getElementById(id);
const canvas = $("screen");
const input = $("type");
let recoveryFiles = null;
let bookRunning = false;

function recoverBook(error) {
  console.error("Recipes could not continue", error);
  showAppRecovery({
    title: bookRunning ? "Recipes stopped" : "Recipes couldn’t open",
    explanation: bookRunning ? [
      "You can’t change your kitchen or food log until you restart.",
      sync.fresh
        ? "This fresh kitchen wasn’t saved. Download a recovery copy before restarting; Restart opens your previously saved kitchen."
        : "Restart to reopen your saved kitchen. The latest changes may not have reached browser storage or your other devices.",
    ] : ["Restart to try opening your saved kitchen again. Recipes couldn’t finish loading."],
    files: recoveryFiles?.() || [],
  });
}

for (const name of ["gesturestart", "gesturechange", "dblclick", "contextmenu"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (e.target !== input && !e.target.closest("#overlay")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

async function main() {
  const params = new URLSearchParams(location.search);
  const fresh = params.has("fresh");
  const [module, book] = await Promise.all([
    WebAssembly.compileStreaming(fetch("recipes.wasm")),
    fetch("recipes.txt").then((r) => r.text()),
  ]);
  // (A fresh start is kept nowhere.)
  sync.fresh = fresh;
  const kitchen = fresh ? "" : await startKitchen(params);
  const fs = new MemFS({ [BOOK]: book, [KITCHEN]: kitchen });
  recoveryFiles = () => [{ name: "recipes-kitchen-recovery.txt", data: fs.readFile(KITCHEN) }];
  const decoder = new TextDecoder();
  let platform = null;
  let pending = "";
  fs.onOutput = (_fd, data) => {
    pending += decoder.decode(data);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (line.startsWith("L8FIELD")) placeField(line.split(" ").slice(1));
      else if (line === "L8BLUR") input.blur();
      else console.log(line);
    }
  };
  const sys = fs.sys(["recipes", BOOK, KITCHEN]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === KITCHEN) saved(decoder.decode(fs.readFile(KITCHEN)));
    return status;
  };
  const env = { L8_PAGE: "1" };
  if (touch) env.L8_TOUCH = "1";
  for (const [k, v] of params) if (k.startsWith("L8_")) env[k] = v;
  sys.env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  platform = createPlatform(canvas, {
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
  sync.send = send;
  sync.reload = (text) => {
    fs.writeFile(KITCHEN, text);
    send(10, 0);
  };
  sync.tell();

  // The book's pixels are the page's: how many window pixels to one, and
  // the phone's own edges (its notch, its home bar).
  // (Measured each frame, and told when they change: the canvas is laid
  // out after the page starts, and again when the window turns.)
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
  // Today, as days from 1 January 1970 where the phone is.
  const sendDay = () => {
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    send(7, Math.floor(day / 1000));
    send(8, day % 1000);
    send(9, new Date().getHours());
  };
  sendSafe();
  sendDay();
  setInterval(sendDay, 60000);

  // The search field: the unseen input over it, and what is typed in it.
  let fieldAt = null;
  let fieldText = "";
  let typed = "";
  function placeField(words) {
    fieldAt = words[0] === "-" ? null : words.slice(0, 4).map(Number);
    if (!fieldAt) {
      if (document.activeElement !== input) input.hidden = true;
      return;
    }
    // (What is written in it, as the book has it: kept the same here.)
    fieldText = words.slice(4).join(" ");
    if (document.activeElement === input && fieldText !== typed) input.value = typed = fieldText;
    const r = canvas.getBoundingClientRect();
    const [x0, y0, x1, y1] = fieldAt;
    Object.assign(input.style, {
      left: `${r.left + x0}px`,
      top: `${r.top + y0}px`,
      width: `${x1 - x0}px`,
      height: `${y1 - y0}px`,
    });
    input.hidden = false;
  }
  input.addEventListener("focus", () => {
    input.value = typed = fieldText;
    send(6, 1);
  });
  input.addEventListener("blur", () => {
    send(6, 0);
    if (!fieldAt) input.hidden = true;
    canvas.focus({ preventScroll: true });
  });
  // (What changed, as backspaces and then letters.)
  input.addEventListener("input", () => {
    const now = input.value;
    let same = 0;
    while (same < typed.length && same < now.length && typed[same] === now[same]) same++;
    for (let i = same; i < typed.length; i++) platform.key(2, 65288);
    for (const ch of now.slice(same)) {
      const c = ch.charCodeAt(0);
      if (c >= 32 && c < 127) platform.key(2, c);
    }
    typed = now;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      if (e.key === "Escape") platform.key(2, 65307);
      input.blur();
    }
  });

  canvas.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("booting")));
  bookRunning = true;
  const status = await runResumable(instance, () => platform.nextFrame());
  recoverBook({ exitStatus: status });
}

// ---- keeping the kitchen ----
const sync = {
  api: "https://trailingwhite.space/recipes/api",
  secret: "",
  state: 0,
  send: null,
  reload: null,
  timer: 0,
  tell() {
    this.send?.(11, this.state);
  },
  set(state) {
    this.state = state;
    this.tell();
  },
};

const call = async (path, body, keepalive = false) => {
  const r = await fetch(sync.api + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${sync.secret}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    keepalive,
    signal: keepalive ? undefined : AbortSignal.timeout(6000),
  });
  if (r.status === 401) sync.unknown = true;
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

// The kitchen to start with: the worker's, or this device's if it was
// changed here since (and later), or if the worker cannot be reached.
async function startKitchen(params) {
  if (params.get("api")) sync.api = params.get("api");
  const me = new URLSearchParams(location.hash.slice(1)).get("me");
  if (me) localStorage.setItem(ME, me);
  sync.secret = localStorage.getItem(ME) || "";
  const local = localStorage.getItem(STORE) || "";
  if (!sync.secret) return local;
  try {
    const there = await call("/kitchen");
    const dirty = localStorage.getItem(DIRTY) === "1";
    const rev = Number(localStorage.getItem(REV) || 0);
    if (dirty && local !== there.text) {
      // (Changed here, and maybe there too: the later wins, and is saved;
      // the worker keeps what it had, and this device what it had.)
      if (rev === there.rev || Number(localStorage.getItem(EDITED) || 0) > there.updated) {
        sync.state = 2;
        setTimeout(push, 0);
        return local;
      }
      localStorage.setItem(ASIDE, local);
    }
    took(there);
    sync.state = 1;
    return there.text;
  } catch (e) {
    console.warn(e);
    sync.state = sync.unknown ? 4 : 3;
    if (!sync.unknown) setTimeout(push, 15000);
    return local;
  }
}

// The worker's kitchen, as this device's.
function took(there) {
  localStorage.setItem(STORE, there.text);
  localStorage.setItem(REV, String(there.rev));
  localStorage.setItem(DIRTY, "0");
}

// The book saved its kitchen: kept here, and soon on the worker.
function saved(text) {
  if (sync.fresh) return;
  localStorage.setItem(STORE, text);
  localStorage.setItem(DIRTY, "1");
  localStorage.setItem(EDITED, String(Date.now()));
  if (!sync.secret) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(push, 1200);
  if (sync.state !== 2) sync.set(2);
}

async function push(keepalive = false) {
  clearTimeout(sync.timer);
  if (!sync.secret || localStorage.getItem(DIRTY) !== "1") return;
  const text = localStorage.getItem(STORE) || "";
  try {
    const r = await call("/kitchen", { text, base: Number(localStorage.getItem(REV) || 0) }, keepalive);
    localStorage.setItem(REV, String(r.rev));
    // (Changed again while it was on its way: that goes next.)
    if (localStorage.getItem(STORE) === text) {
      localStorage.setItem(DIRTY, "0");
      sync.set(1);
    } else sync.timer = setTimeout(push, 1200);
  } catch (e) {
    console.warn(e);
    sync.set(sync.unknown ? 4 : 3);
    if (!sync.unknown) sync.timer = setTimeout(push, 15000);
  }
}

// Looked at again: what was saved from elsewhere since, if nothing is
// waiting to be saved from here.
async function pull() {
  if (!sync.secret || !sync.reload) return;
  if (localStorage.getItem(DIRTY) === "1") return push();
  try {
    const there = await call("/kitchen");
    if (there.rev !== Number(localStorage.getItem(REV) || 0) && localStorage.getItem(DIRTY) !== "1") {
      took(there);
      sync.reload(there.text);
    }
    sync.set(1);
  } catch (e) {
    console.warn(e);
    sync.set(sync.unknown ? 4 : 3);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pull();
  else push(true);
});
addEventListener("online", () => push());
setInterval(() => {
  if (document.visibilityState === "visible") pull();
}, 120000);

main().catch(recoverBook);
