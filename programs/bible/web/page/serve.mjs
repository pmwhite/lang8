// The site as smoothbible.com serves it, for local development:
//   [SB_API=https://smoothbible.com] [SB_DEV=1] node programs/bible/web/page/serve.mjs [SITE] [PORT]
//   (.build/bible-site, 8470; SB_API: the ESV's requests to that Worker;
//   SB_DEV: the page may reach a hot reload server, ?dev: RELOAD.md)
// Requests go to the real Worker (programs/bible/worker/worker.js), with
// ASSETS standing in for Cloudflare's static assets over SITE as
// wrangler.toml configures them (html_handling "auto-trailing-slash",
// not_found_handling "404-page"). The Worker has no ESV key here, so the
// ESV is not offered. The Worker routes /read/ and sets its headers (the
// CSP among them), as it will live (WEB.md §W2.1a).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import worker from "../../worker/worker.js";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".gz": "application/gzip",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

export function serve(site, port) {
  const file = (rel) => {
    const p = path.join(site, rel);
    if (!p.startsWith(site)) return null;
    try {
      return fs.statSync(p).isFile() ? p : null;
    } catch {
      return null;
    }
  };
  const answer = (p, status = 200) =>
    new Response(fs.readFileSync(p), {
      status,
      headers: { "content-type": types[path.extname(p)] || "application/octet-stream" },
    });

  // Cloudflare's assets: /x/ is x/index.html, /x is x.html; a missing page
  // is the site's 404 page.
  const ASSETS = {
    async fetch(request) {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.pathname);
      let p = rel.endsWith("/") ? file(rel + "index.html") : file(rel) || file(rel + ".html");
      if (!p && !rel.endsWith("/") && file(rel + "/index.html")) return Response.redirect(url.origin + rel + "/", 307);
      if (p) return answer(p);
      return answer(file("404.html"), 404);
    },
  };
  const env = { ASSETS, UPSTREAM: "http://127.0.0.1:9/", PER_IP: { limit: async () => ({ success: true }) } };

  const server = http.createServer(async (req, res) => {
    // (/read/api/ is /api/: a tailnet may forward only /read.)
    if (req.url.startsWith("/read/api/")) req.url = req.url.slice(5);
    const request = new Request(`http://smoothbible.com${req.url}`, { method: req.method, headers: req.headers });
    // (The ESV's requests to a Worker that has its key, where SB_API names
    // one: SB_API=https://smoothbible.com. Else this one's, without.)
    const api = process.env.SB_API && req.url.startsWith("/api/");
    const r = api
      ? await fetch(process.env.SB_API + req.url, { headers: { "x-smooth-bible": req.headers["x-smooth-bible"] || "web (1)" } })
      : await worker.fetch(request, env);
    let body = Buffer.from(await r.arrayBuffer());
    // (Compressed as Cloudflare does text, scripts and wasm, so the budgets
    // see what a phone would be sent; data files are gzip themselves.)
    const headers = Object.fromEntries(r.headers);
    // (SB_DEV=1: the page may reach a hot reload server, web/dev.mjs, on
    // any address: RELOAD.md.)
    if (process.env.SB_DEV && headers["content-security-policy"]) headers["content-security-policy"] = headers["content-security-policy"].replace("connect-src 'self'", "connect-src 'self' http: ws:");
    // (A proxied answer's body is already decoded.)
    if (api) {
      delete headers["content-encoding"];
      delete headers["content-length"];
    }
    if (/gzip/.test(req.headers["accept-encoding"] || "") && /^(text\/|application\/(wasm|javascript)|image\/svg)/.test(headers["content-type"] || "")) {
      body = zlib.gzipSync(body);
      headers["content-encoding"] = "gzip";
      headers["content-length"] = String(body.length);
    }
    res.writeHead(r.status, headers);
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const site = path.resolve(process.argv[2] || ".build/bible-site");
  const port = Number(process.argv[3] || 8470);
  await serve(site, port);
  console.log(`http://127.0.0.1:${port}/read/`);
}
