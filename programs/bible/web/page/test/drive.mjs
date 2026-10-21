// The web reader's driver (WEB.md §W14.2): headless Chrome over the DevTools
// Protocol (Node's own WebSocket; no dependencies but axe-core, injected
// into pages), against the site served through the real Worker (serve.mjs).
//
//   node programs/bible/web/page/test/drive.mjs [--site DIR] [--out DIR] [--only NAME,...] [--no-shots]
//
// Runs flows.mjs's flows: each prints its checks; a failed check, a console
// error or a request to any other host fails the run. Shots go to OUT
// (.build/bible-web-shots) as w<phase>-<nn>-<what>-<size>-<theme>.png.
// CHROME names the browser (else google-chrome, chromium).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { serve } from "./serve.mjs";
import { sleep } from "./pixels.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../../../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const site = path.resolve(arg("--site", path.join(root, ".build/bible-site")));
const out = path.resolve(arg("--out", path.join(root, ".build/bible-web-shots")));
const only = arg("--only", "") ? arg("--only").split(",") : null;
const shotsOn = !process.argv.includes("--no-shots");

const which = (names) => {
  for (const n of names) {
    try {
      return execFileSync("sh", ["-c", `command -v ${n}`]).toString().trim();
    } catch {}
  }
  throw new Error("no Chrome: set CHROME");
};

// ---- the browser ----
export async function launch() {
  const bin = process.env.CHROME || which(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]);
  const port = 9300 + Math.floor(Math.random() * 600);
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "sb-chrome-"));
  const proc = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}`, "--no-first-run",
    "--no-default-browser-check", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars",
    "--font-render-hinting=none", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
  const close = () => {
    try {
      proc.kill("SIGKILL");
    } catch {}
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  };
  process.on("exit", close);
  let version = null;
  for (let i = 0; i < 150 && !version; i++) {
    await sleep(100);
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {}
  }
  if (!version) throw new Error("Chrome did not start");
  return { port, close, version: version.Browser };
}

// A page: a fresh target with its own session.
export async function newPage(port, problems) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const handlers = new Set();
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const [res, rej] = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message} (${msg.error.data || ""})`)) : res(msg.result);
    } else for (const h of handlers) h(msg);
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, [res, rej]);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const page = { send, on: (h) => handlers.add(h), off: (h) => handlers.delete(h), logs: [], dims: null };
  handlers.add((m) => {
    if (m.method === "Runtime.consoleAPICalled") {
      const line = m.params.args.map((a) => a.value ?? a.description).join(" ");
      page.logs.push(line);
      if (m.params.type === "error" && !page.quietErrors) problems.push("console error: " + line);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      problems.push("exception: " + (d.exception?.description || d.text));
    } else if (m.method === "Network.requestWillBeSent") {
      const u = new URL(m.params.request.url);
      if (!["127.0.0.1", "localhost"].includes(u.hostname) && !["data:", "blob:", "about:"].includes(u.protocol))
        problems.push("request to another host: " + m.params.request.url);
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  // (Focus events as in a window the reader is looking at.)
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  Object.assign(page, {
    async close() {
      ws.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
    },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async size(w, h, scale = 1, mobile = false) {
      page.dims = { w, h, scale, mobile };
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
    },
    async theme(dark) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
    },
    async open(url, ready = true) {
      const loaded = new Promise((r) => {
        const h = (m) => {
          if (m.method === "Page.loadEventFired") {
            page.off(h);
            r();
          }
        };
        page.on(h);
      });
      await send("Page.navigate", { url });
      await loaded;
      if (ready) await page.waitFor("window.sbReady > 0");
    },
    async waitFor(expr, ms = 20000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await page.eval(expr).catch(() => false)) return true;
        await sleep(40);
      }
      throw new Error("timed out waiting for " + expr);
    },
    // Two animation frames: what was changed is drawn.
    frames: (n = 2) => page.eval(`new Promise((r) => { let k = ${n}; const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); })`),
    // At rest after a scroll: the app's scrollend work done.
    async rest() {
      await sleep(350);
      await page.frames(2);
    },
    async click(x, y, modifiers = 0) {
      for (const type of ["mousePressed", "mouseReleased"])
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, modifiers });
    },
    async tap(x, y) {
      if (!page.dims?.mobile) return page.click(x, y);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x, y }] });
    },
    async key(key, modifiers = 0) {
      const codes = { Escape: 27, Enter: 13, Home: 36, Tab: 9, "]": 221, "[": 219, ",": 188, "?": 191 };
      const text = key.length === 1 ? key : undefined;
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, text, windowsVirtualKeyCode: codes[key] || 0, modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: codes[key] || 0, modifiers });
    },
    async png() {
      const r = await send("Page.captureScreenshot", { format: "png" });
      return Buffer.from(r.data, "base64");
    },
  });
  return page;
}

// ---- running ----
export const SIZES = {
  phone: [390, 844, 2, true],
  tablet: [820, 1180, 2, false],
  desktop: [1440, 900, 1, false],
};

async function main() {
  if (!fs.existsSync(path.join(site, "read", "shell.html"))) throw new Error("no site in " + site + ": make bible-web");
  fs.mkdirSync(out, { recursive: true });
  const port = 8500 + Math.floor(Math.random() * 400);
  const server = await serve(site, port);
  const chrome = await launch();
  const base = `http://127.0.0.1:${port}`;
  const { flows } = await import("./flows.mjs");
  const results = [];
  let failed = 0;
  const started = Date.now();
  console.log(`${chrome.version}, ${base}`);
  // (A first page, so the browser's own start-up is not timed.)
  {
    const warm = await newPage(chrome.port, []);
    await warm.open(base + "/read/about", false);
    await warm.close();
  }
  for (const [name, flow] of Object.entries(flows)) {
    if (only && !only.includes(name)) continue;
    const problems = [];
    const page = await newPage(chrome.port, problems);
    const t0 = Date.now();
    const ctx = {
      base,
      page,
      SIZES,
      shots: shotsOn,
      log: (s) => console.log("    " + s),
      check(what, ok, detail = "") {
        results.push({ flow: name, what, ok });
        if (!ok) failed++;
        console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ": " + detail : ""}`);
      },
      async shot(file) {
        if (!shotsOn) return;
        fs.writeFileSync(path.join(out, file + ".png"), await page.png());
      },
      out,
      newPage: () => newPage(chrome.port, problems),
    };
    console.log(name);
    try {
      await flow(ctx);
    } catch (e) {
      ctx.check("ran to the end", false, e.message);
    }
    for (const p of problems) ctx.check("no " + p.split(":")[0], false, p);
    await page.close();
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  chrome.close();
  server.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed} of ${results.length} checks passed, ${failed} failed, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(results, null, 1));
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${path.resolve(process.argv[1])}`) await main();
