// Smooth Bible's Service Worker (WEB.md §W9.1), scope /read/: the reader
// works with no connection once visited. build.py fills in the build's
// files. On install it keeps the shell (the page every reader's address
// is, the About page, the styles, the scripts, the module, the icons, the
// fonts); the data (versions, the language data, the Manual, timings) is
// kept the first time the app reads it, by its hashed place, and read from
// here ever after. A reader's address is answered with the shell kept,
// which draws the chapter from the text kept. Never kept: the site's
// /api/ (the ESV, its recordings' addresses) and anything from elsewhere
// (the recordings). A new build installs quietly and takes over the next
// time the app is opened; its old files are let go then.
const BUILD = "{{build}}";
const SHELL = {{shell}};
const DATA = "{{data}}";
const KEEP = "sb-shell-" + BUILD;
const KEEP_DATA = "sb-data-" + DATA;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(KEEP).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (e) => {
  // (The first: the page that registered it is its at once, so what it
  // reads from now is kept.)
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sb-") && k !== KEEP && k !== KEEP_DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// What is kept, else fetched (and kept, if it is the build's or the data's).
async function kept(request, name) {
  const c = await caches.open(name);
  const hit = await c.match(request, { ignoreVary: true });
  if (hit) return hit;
  const r = await fetch(request);
  if (r.ok && r.type === "basic") await c.put(request, r.clone());
  return r;
}

// A reader's address: the shell kept (About its own page); else the
// network's answer.
async function page(url, request) {
  const c = await caches.open(KEEP);
  const hit = await c.match(url.pathname === "/read/about" ? "/read/about" : "/read/shell");
  if (hit) return hit;
  return fetch(request);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/read/api/") || p === "/read/sw.js") return;
  if (e.request.mode === "navigate") {
    if (p.startsWith("/read/")) e.respondWith(page(url, e.request));
    return;
  }
  if (p.startsWith("/read/data/")) e.respondWith(kept(e.request, KEEP_DATA));
  else if (p.startsWith("/read/") || p.startsWith("/img/")) e.respondWith(kept(e.request, KEEP));
});
