// The run catcher: where the copy of the skate page on this machine's
// tailnet sends each run finished on it (see sendRunHome, in
// web/skate/skate.js), with the jank the game saw, to be looked into
// (programs/skate/tools/jank.py).
//
//     node programs/skate/tools/runs.mjs [DIR] [PORT]
//
// Each run is kept in DIR (default /var/tmp/blockguy/runs) as JSON, named
// for when it came and its course and score. GET /blockguy/runs lists
// them, newest first; GET /blockguy/runs/NAME is one. It listens only on
// this machine (port 8796); `tailscale serve --bg --set-path /blockguy/runs
// http://127.0.0.1:8796/blockguy/runs` puts it on the tailnet beside the
// page.
import http from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] ?? "/var/tmp/blockguy/runs";
const port = Number(process.argv[3] ?? 8796);
await mkdir(dir, { recursive: true });

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname.replace(/\/+$/, "");
  if (!path.startsWith("/blockguy/runs")) return send(res, 404, { error: "not here" });
  if (req.method === "POST" && path === "/blockguy/runs") {
    let size = 0;
    const parts = [];
    for await (const part of req) {
      size += part.length;
      if (size > 4 << 20) return send(res, 413, { error: "too big" });
      parts.push(part);
    }
    let run;
    try {
      run = JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
      return send(res, 400, { error: "not JSON" });
    }
    const r = run?.run;
    if (!r || typeof r.replay !== "string" || !Number.isFinite(r.course) || !Number.isFinite(r.score)) return send(res, 400, { error: "not a run" });
    const when = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const name = `${when}-c${r.course}-${r.score}.json`;
    await writeFile(join(dir, name), JSON.stringify(run, null, 1));
    console.log(`${name}: ${(run.jank ?? []).length} jank lines`);
    return send(res, 200, { kept: name });
  }
  if (req.method === "GET" && path === "/blockguy/runs") {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort().reverse();
    return send(res, 200, names);
  }
  const name = path.slice("/blockguy/runs/".length);
  if (req.method === "GET" && /^[\w.-]+\.json$/.test(name)) {
    try {
      return send(res, 200, await readFile(join(dir, name), "utf8"));
    } catch {
      return send(res, 404, { error: "no such run" });
    }
  }
  send(res, 404, { error: "not here" });
});
server.listen(port, "127.0.0.1", () => console.log(`runs: keeping them in ${dir}, on 127.0.0.1:${port}`));
