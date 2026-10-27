#!/usr/bin/env node
// The hot reload development server (RELOAD.md): build an L8 program as a
// WebAssembly module whenever a source in its import graph changes, and
// hand each build to the apps waiting for it.
//
//   node web/dev.mjs [--port 8777] [--l8 ./l8c3] [--serve DIR] -- <l8 wasm arguments>
//   node web/dev.mjs -- --async bw_wait programs/bible/web/main.l8 -o .build/dev/bible.wasm
//
// Everything after `--` is given to `l8 wasm` as it is (the source is the
// `.l8` argument; `-o` is added when missing). The server answers, with
// CORS open so a page served from anywhere may ask:
//
//   GET /build             {build, ok, log, ms, time} of the latest build
//   GET /wait?since=N      the same, once there is a build after N (or after
//                          25 s, the latest); a client's long poll
//   GET /build.wasm        the latest successful build's module
//   POST /log              a line from a device (the hot reload host's own,
//                          and its module's stderr): printed, kept for GET /log
//   POST /control          a command for the device (web/devctl.mjs): shot,
//                          notify NAME, reload, exit; GET /next?since=N is the
//                          device's long poll for commands after N
//   POST /wire             a line for the app's core (web/devctl.mjs wire:
//                          what a skin would send it, as `tap shelf`);
//                          GET /wire?since=N is the app's long poll for
//                          lines after N (Smooth Bible's ios/devwire.l8)
//   POST /shot             a screenshot (PNG) from the device, saved under
//                          .build/dev/shots/; GET /shots/latest says which
//   GET /<path>            a file under --serve DIR, if given
//
// web/reload.js's watchBuilds() is the client.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
if (dash < 0 || dash === argv.length - 1) {
  console.error("usage: node web/dev.mjs [--port N] [--l8 COMPILER] [--serve DIR] -- <l8 wasm arguments>");
  process.exit(2);
}
const options = argv.slice(0, dash);
const compilerArgs = argv.slice(dash + 1);
let port = 8777;
let l8 = fs.existsSync("./l8c3") ? "./l8c3" : "./l8";
let serveDir = null;
for (let i = 0; i < options.length; i++) {
  const o = options[i];
  if (o === "--port") port = Number(options[++i]);
  else if (o === "--l8") l8 = options[++i];
  else if (o === "--serve") serveDir = path.resolve(options[++i]);
  else {
    console.error(`unknown option ${o}`);
    process.exit(2);
  }
}
const source = compilerArgs.find((a) => a.endsWith(".l8"));
if (!source) {
  console.error("no .l8 source among the compiler arguments");
  process.exit(2);
}
let output;
const o = compilerArgs.indexOf("-o");
if (o >= 0) output = compilerArgs[o + 1];
else {
  output = path.join(".build", "dev", path.basename(source, ".l8") + ".wasm");
  compilerArgs.push("-o", output);
}
fs.mkdirSync(path.dirname(output), { recursive: true });

// ---- the import graph ----
// The files a build reads: the source and, through `import "..."` lines
// (relative to the importing file), everything it reaches.
function graph(entry) {
  const seen = new Set();
  const todo = [path.resolve(entry)];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/^\s*import\s+"([^"]+)"/gm)) todo.push(path.resolve(path.dirname(f), m[1]));
  }
  return [...seen];
}

// ---- building ----
// Keep revisions ahead of clients even when the development server restarts.
const state = { build: Date.now(), ok: false, log: "", ms: 0, time: 0, wasm: null };
let files = [];
let mtimes = new Map();
let building = null;
let wanted = false;
const waiters = new Set();

function snapshot() {
  files = graph(source);
  mtimes = new Map(files.map((f) => [f, mtime(f)]));
}

function mtime(f) {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}

function changed() {
  for (const [f, t] of mtimes) if (mtime(f) !== t) return true;
  // A new import is in the graph only after a build; a changed import
  // line changed its file, which the loop above sees.
  return false;
}

function build() {
  if (building) {
    wanted = true;
    return building;
  }
  snapshot();
  const started = Date.now();
  building = new Promise((resolve) => {
    const child = spawn(l8, ["wasm", ...compilerArgs], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => {
      const ms = Date.now() - started;
      state.build++;
      state.ok = code === 0;
      state.log = log.trimEnd();
      state.ms = ms;
      state.time = Date.now();
      if (state.ok) {
        try {
          state.wasm = fs.readFileSync(output);
        } catch (e) {
          state.ok = false;
          state.log = `${log}\ncannot read ${output}: ${e.message}`;
        }
      }
      const when = new Date().toLocaleTimeString();
      if (state.ok) console.log(`${when}  build ${state.build}: ${state.wasm.length} bytes in ${ms} ms`);
      else console.log(`${when}  build ${state.build} failed (${ms} ms)\n${state.log}`);
      for (const w of waiters) w();
      waiters.clear();
      building = null;
      resolve();
      if (wanted) {
        wanted = false;
        build();
      }
    });
  });
  return building;
}

// Watch by polling the graph's files (fs.watch misses editors that replace
// a file, and recursive watching is not everywhere).
let debounce = null;
setInterval(() => {
  if (!changed() || building) return;
  clearTimeout(debounce);
  debounce = setTimeout(build, 120);
}, 250);

// ---- the server ----
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const info = () => ({ build: state.build, ok: state.ok, log: state.log, ms: state.ms, time: state.time, source });

const deviceLog = [];
const commands = [];
let commandId = Date.now();
const commandWaiters = new Set();
const wires = [];
let wireId = Date.now();
const wireWaiters = new Set();
const shotsDir = path.join(".build", "dev", "shots");
let shots = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/log" || req.method !== "POST") console.log(`${new Date().toLocaleTimeString()}  ${req.socket.remoteAddress} ${req.method} ${req.url}`);
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  const json = (body, status = 200) => {
    res.writeHead(status, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/log" && req.method === "POST") {
    const parts = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => {
      const text = Buffer.concat(parts).toString("utf8").replace(/\n+$/, "");
      const when = new Date().toLocaleTimeString();
      for (const line of text.split("\n")) {
        console.log(`${when}  phone: ${line}`);
        deviceLog.push(`${when}  ${line}`);
      }
      if (deviceLog.length > 2000) deviceLog.splice(0, deviceLog.length - 2000);
      json({ ok: true });
    });
    return;
  }
  if (url.pathname === "/log") {
    res.writeHead(200, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    return res.end(deviceLog.join("\n") + "\n");
  }
  if (url.pathname === "/control" && req.method === "POST") {
    const parts = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => {
      const cmd = Buffer.concat(parts).toString("utf8").trim();
      const id = ++commandId;
      commands.push({ id, cmd });
      console.log(`${new Date().toLocaleTimeString()}  command ${id}: ${cmd}`);
      for (const w of commandWaiters) w();
      commandWaiters.clear();
      json({ id });
    });
    return;
  }
  if (url.pathname === "/wire" && req.method === "POST") {
    const parts = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => {
      const id = ++wireId;
      const lines = Buffer.concat(parts).toString("utf8").split("\n").map((l) => l.trim()).filter((l) => l);
      for (const line of lines) wires.push({ id, line });
      if (wires.length > 500) wires.splice(0, wires.length - 500);
      console.log(`${new Date().toLocaleTimeString()}  wire ${id}: ${lines.join(" | ")}`);
      for (const w of wireWaiters) w();
      wireWaiters.clear();
      json({ id });
    });
    return;
  }
  if (url.pathname === "/wire") {
    // (As /next: a newly started app takes the cursor, no old lines.)
    const since = Number(url.searchParams.get("since") || 0);
    const text = (body) => {
      res.writeHead(200, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      res.end(body);
    };
    if (since === 0) return text(`${wireId}\t\n`);
    const answer = () => text(wires.filter((w) => w.id > since).map((w) => `${w.id}\t${w.line}\n`).join("") || `${wireId}\t\n`);
    if (wireId > since) return answer();
    const done = () => {
      clearTimeout(timer);
      wireWaiters.delete(done);
      answer();
    };
    const timer = setTimeout(done, 25000);
    wireWaiters.add(done);
    req.on("close", () => {
      clearTimeout(timer);
      wireWaiters.delete(done);
    });
    return;
  }
  if (url.pathname === "/next") {
    const since = Number(url.searchParams.get("since") || 0);
    // A newly launched host starts at zero. Establish its cursor without
    // replaying a previous run's reloads, screenshots, or destructive demos.
    if (since === 0) {
      res.writeHead(200, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      return res.end(`${commandId}\tsay control connected\n`);
    }
    const answer = () => {
      res.writeHead(200, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      // (None kept after the device's cursor, as after a restart: the
      // cursor moved to the latest, so the device waits again.)
      const newer = commands.filter((c) => c.id > since);
      res.end(newer.length ? newer.map((c) => `${c.id}\t${c.cmd}\n`).join("") : `${commandId}\tsay control connected\n`);
    };
    if (commandId > since) return answer();
    const done = () => {
      clearTimeout(timer);
      commandWaiters.delete(done);
      answer();
    };
    const timer = setTimeout(done, 25000);
    commandWaiters.add(done);
    req.on("close", () => {
      clearTimeout(timer);
      commandWaiters.delete(done);
    });
    return;
  }
  if (url.pathname === "/shot" && req.method === "POST") {
    const parts = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => {
      fs.mkdirSync(shotsDir, { recursive: true });
      shots++;
      const file = path.join(shotsDir, `${shots}.png`);
      fs.writeFileSync(file, Buffer.concat(parts));
      console.log(`${new Date().toLocaleTimeString()}  screenshot ${shots}: ${file}`);
      json({ shot: shots, file });
    });
    return;
  }
  if (url.pathname === "/shots/latest") return json({ shot: shots, file: shots ? path.join(shotsDir, `${shots}.png`) : null });
  if (url.pathname === "/build") return json(info());
  if (url.pathname === "/wait") {
    const since = Number(url.searchParams.get("since") || 0);
    if (state.build > since) return json(info());
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      json(info());
    };
    const timer = setTimeout(done, 25000);
    waiters.add(done);
    req.on("close", () => {
      clearTimeout(timer);
      waiters.delete(done);
    });
    return;
  }
  if (url.pathname === "/build.wasm") {
    if (!state.wasm) return json({ error: "no successful build yet", log: state.log }, 503);
    res.writeHead(200, { ...headers, "Content-Type": "application/wasm" });
    return res.end(state.wasm);
  }
  if (serveDir) {
    const rel = decodeURIComponent(url.pathname);
    let p = path.join(serveDir, rel.endsWith("/") ? rel + "index.html" : rel);
    if (p.startsWith(serveDir) && fs.existsSync(p) && fs.statSync(p).isFile()) {
      res.writeHead(200, { ...headers, "Content-Type": types[path.extname(p)] || "application/octet-stream" });
      return res.end(fs.readFileSync(p));
    }
  }
  if (url.pathname === "/") {
    res.writeHead(200, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    return res.end(`l8 hot reload: ${source}\nbuild ${state.build} ${state.ok ? "ok" : "failed"}\n${state.log}\n`);
  }
  json({ error: "not found" }, 404);
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list) if (a.family === "IPv4" && !a.internal) return a.address;
  return "127.0.0.1";
}

server.listen(port, () => {
  console.log(`l8 hot reload: ${l8} wasm ${compilerArgs.join(" ")}`);
  console.log(`serving builds at http://${lanAddress()}:${port}/  (and http://localhost:${port}/)`);
  build();
});
