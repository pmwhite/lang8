// Runs a steps file against Smooth Bible's web page in headless Chromium
// with uilog.js injected, and writes the UI-change log (README.md).
//
//   node programs/bible/tools/uilog/rig.mjs STEPS.mjs [--out FILE.jsonl]
//       [--url URL] [--size WxH] [--mobile] [--shot FILE.png]
//
// The page is the site as `make bible-web` builds it, served by
// `node programs/bible/web/page/serve.mjs .build/bible-site 8491`; the
// default address adds ?debug, which gives the page sbSend(). A steps
// file's default export is an async function given the helpers below;
// logging is on from page load until it returns unless it calls
// stop()/start() itself.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const stepsPath = args.find((a, i) => a.endsWith(".mjs") && args[i - 1] !== "--out");
if (!stepsPath) {
  console.error("usage: node rig.mjs STEPS.mjs [--out FILE.jsonl] [--url URL] [--size WxH] [--mobile] [--shot FILE.png]");
  process.exit(2);
}
const url = option("--url", "http://127.0.0.1:8491/read/?debug");
const out = option("--out", "/tmp/ux/uilog/" + path.basename(stepsPath, ".mjs") + ".jsonl");
const [width, height] = option("--size", "1200x800").split("x").map(Number);
const mobile = args.includes("--mobile");

// Its own port and profile, the profile new each run: a service worker
// left from an earlier run serves a blank page. (--password-store=basic:
// asked for the desktop's keyring, Chromium waits out a 25 s D-Bus timeout
// before its first request.)
const port = 9533;
const profile = "/tmp/uilog-rig-profile";
try {
  await fetch(`http://127.0.0.1:${port}/json/version`);
  console.error(`port ${port} is taken (another rig's Chromium left running?): kill it by its PID first`);
  process.exit(1);
} catch {}
fs.rmSync(profile, { recursive: true, force: true });
const chrome = spawn("chromium", ["--headless=new", `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, "--no-first-run", "--password-store=basic", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", detached: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (Chromium goes with the rig however it ends.)
process.on("exit", () => {
  try {
    process.kill(-chrome.pid, "SIGKILL");
  } catch {}
});
const finish = (code) => process.exit(code);

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  } catch {
    await sleep(200);
  }
}
const target = targets?.find((t) => t.type === "page");
if (!target) {
  console.error(`chromium did not open a page on port ${port}`);
  finish(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) {
    waiting.get(d.id)(d);
    waiting.delete(d.id);
  }
  if (d.method === "Runtime.exceptionThrown") console.error("page exception:", JSON.stringify(d.params.exceptionDetails).slice(0, 400));
};
const cmd = (method, params = {}) =>
  new Promise((r) => {
    const i = ++nextId;
    waiting.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) => {
  const r = await cmd("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};

// ---- the helpers a steps file is given ----
const mouse = (type, x, y, extra = {}) => cmd("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
const helpers = {
  ev,
  cmd,
  sleep,
  log: (...a) => console.log(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
  // A note in the uilog (shown in the checker's timeline).
  mark: (label) => ev(`__uilog.mark(${JSON.stringify(label)})`),
  // A line for core, standing for a tap the skin would turn into it
  // (kept as an input in the log).
  send: (line) => ev(`__uilog.input("wire", ${JSON.stringify(line)}); sbSend(${JSON.stringify(line)})`),
  start: () => ev("__uilog.start()"),
  stop: () => ev("__uilog.stop()"),
  // A real mouse click at x, y, or at the centre of the first element
  // matching selector (and, if given, whose text matches pattern),
  // scrolled into sight first if it is out of it (kept as an input).
  click: async (x, y) => {
    await mouse("mouseMoved", x, y, { button: "none" });
    await mouse("mousePressed", x, y);
    await sleep(40);
    await mouse("mouseReleased", x, y);
  },
  clickOn: async (selector, pattern) => {
    const at = await ev(`(() => { const re = ${pattern ? pattern.toString() : "null"}; const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.getClientRects().length && (!re || re.test(e.innerText || e.getAttribute("aria-label") || ""))); if (!e) return null; let r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { __uilog.input("scroll-into-view"); e.scrollIntoView({ block: "center" }); r = e.getBoundingClientRect(); } return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!at) {
      console.log(`no element ${selector} ${pattern || ""} to click`);
      return false;
    }
    await helpers.click(at[0], at[1]);
    return true;
  },
  wheel: async (x, y, dy, steps = 1, gap = 16) => {
    for (let i = 0; i < steps; i++) {
      await cmd("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
      await sleep(gap);
    }
  },
  drag: async (x, y0, y1, steps = 20, gap = 16) => {
    await cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cmd("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
      await sleep(gap);
    }
    await cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  },
  // A finger's flick at x, y: dy pixels of content (positive: down the
  // page, as a finger moving up), at speed pixels a second, then the
  // browser's own glide.
  flick: (x, y, dy, speed = 1500) => cmd("Input.synthesizeScrollGesture", { x, y, yDistance: -dy, speed, gestureSourceType: "mouse" }),
  // Typing into the focused element, a key at a time.
  type: async (text, gap = 90) => {
    for (const ch of text) {
      await cmd("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch });
      await cmd("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
      await sleep(gap);
    }
  },
  key: async (key, code = key) => {
    await cmd("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: { Escape: 27, Enter: 13, Backspace: 8 }[key] || 0, text: key === "Enter" ? "\r" : undefined });
    await cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  },
  shot: async (file) => {
    const r = await cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  },
  // Until expression is true (polled), at most ms.
  until: async (expression, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await ev(expression)) return true;
    console.log(`timed out waiting for ${expression}`);
    return false;
  },
};

await cmd("Page.enable");
await cmd("Runtime.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
if (mobile) await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await cmd("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "uilog.js"), "utf8") });
// (Not waited for: polled below.)
cmd("Page.navigate", { url });
await sleep(300);
await helpers.until("typeof sbSend === 'function' && document.querySelector('#reader [data-v]') !== null", 20000);
await ev("__uilog.start()");

let failed = false;
try {
  await (await import(path.resolve(stepsPath))).default(helpers);
} catch (e) {
  failed = true;
  console.error("steps failed:", e);
}
await ev("__uilog.stop()");
const count = await ev("__uilog.count()");
const lines = [];
for (let from = 0; from < count; from += 5000) lines.push(await ev(`__uilog.dump(${from}, 5000)`));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.filter((l) => l).join("\n") + "\n");
const shotPath = option("--shot", null);
if (shotPath) await helpers.shot(shotPath);
const build = count ? JSON.parse(lines[0].split("\n")[0]).build : {};
console.log(`${count} events in ${out} (build ${build.app} ${build.wasm})`);
ws.close();
finish(failed ? 1 : 0);
