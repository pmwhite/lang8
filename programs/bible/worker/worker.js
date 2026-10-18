// Smooth Bible's proxy for the ESV (DESIGN.md §9.4.2): a Cloudflare
// Worker at smoothbible.com/api/, holding the ESV API's key (the secret
// ESV_KEY) so that the app never does. It answers the app's requests for
// chapters and searches within Crossway's terms (api.esv.org: 500 verses or
// half a book a query; 5,000 queries a day, 1,000 an hour, 60 a minute, for
// all of the app's readers together), and keeps nothing but counts: no
// text, no query, no address (the rate limit holds an address for its
// minute only). It logs nothing of its own.
//
//   GET /api/v1/status                          {ok, esv}: is the ESV here
//                                               (no call to the ESV API)
//   GET /api/v1/esv/chapters?book=JHN&chapter=3&count=2
//       {v, version, notice, chapters: [{book, chapter, verses, records}]}
//   GET /api/v1/esv/search?q=born%20again&page=1
//       {v, total, page, pages, results: [{book, chapter, verse, key, text}]}
//
// Errors are {error, message, retry} (seconds): 400 bad_request, 429
// slow_down (this address) or busy (the minute's or hour's budget), 503
// daily_limit, 502 upstream, 504 timeout. Every request must say
// X-Smooth-Bible: <version> (<build>). UPSTREAM (a var) is the ESV API's
// address; tests point it at a mock.
import { BOOKS } from "./versecounts.js";
import { convert, keyOf } from "./esv.js";

// The budget for every call upstream, under the terms with room to spare.
export const BUDGET = { minute: 55, hour: 950, day: 4800 };
const MOST_VERSES = 500;
const TIMEOUT = 8000;

const headers = { "content-type": "application/json", "cache-control": "no-store" };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const fail = (status, error, message, retry = 0) => reply(status, { error, message, retry });

const book = (code) => BOOKS.find((b) => b[0] === code);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// How many chapters to give from chapter c of book b: count, but 1 if the
// two would pass 500 verses, or half the book in a book of more than two
// chapters; never past the book's end.
export const chaptersFor = (b, c, count) => {
  const counts = b[2];
  if (count < 2 || c >= counts.length) return 1;
  const verses = counts[c - 1] + counts[c];
  if (verses > MOST_VERSES) return 1;
  if (counts.length > 2 && verses > Math.floor(sum(counts) / 2)) return 1;
  return 2;
};

// The time's buckets: minute, hour and day (UTC), and seconds to the end
// of each.
export const buckets = (now) => {
  const iso = new Date(now).toISOString();
  const s = Math.floor(now / 1000);
  return {
    m: "m:" + iso.slice(0, 16),
    h: "h:" + iso.slice(0, 13),
    d: "d:" + iso.slice(0, 10),
    toMinute: 60 - (s % 60),
    toHour: 3600 - (s % 3600),
    toDay: 86400 - (s % 86400),
    day: iso.slice(0, 10),
  };
};

// One more call upstream counted (in one statement), and the counts back;
// the first call of a day lets go of buckets two days old. An error
// response if the budget is spent, else null.
const spend = async (env, now) => {
  const k = buckets(now);
  const rows = await env.DB.prepare(
    "INSERT INTO usage (bucket, n) VALUES (?1, 1), (?2, 1), (?3, 1) ON CONFLICT (bucket) DO UPDATE SET n = n + 1 RETURNING bucket, n",
  )
    .bind(k.m, k.h, k.d)
    .all();
  const n = {};
  for (const r of rows.results ?? []) n[r.bucket] = r.n;
  if (n[k.d] === 1) {
    const old = new Date(now - 2 * 86400000).toISOString().slice(0, 10);
    await env.DB.prepare("DELETE FROM usage WHERE substr(bucket, 3, 10) < ?1").bind(old).run();
  }
  if ((n[k.d] ?? 0) > BUDGET.day)
    return fail(503, "daily_limit", "The ESV has reached its daily limit for Smooth Bible.", k.toDay);
  if ((n[k.h] ?? 0) > BUDGET.hour) return fail(429, "busy", "Many people are reading the ESV just now.", k.toHour);
  if ((n[k.m] ?? 0) > BUDGET.minute) return fail(429, "busy", "Many people are reading the ESV just now.", k.toMinute);
  return null;
};

// A GET of the ESV API, its key sent; within 8 seconds.
const upstream = async (env, path, params) => {
  const url = new URL(path, env.UPSTREAM || "https://api.esv.org");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: { authorization: `Token ${env.ESV_KEY}` }, signal: ctl.signal });
    if (r.status === 429) return { error: fail(429, "busy", "Many people are reading the ESV just now.", 60) };
    if (r.status !== 200) return { error: fail(502, "upstream", "The ESV isn't available right now.") };
    return { body: await r.json() };
  } catch (e) {
    return { error: fail(504, "timeout", "The ESV didn't answer in time.") };
  } finally {
    clearTimeout(timer);
  }
};

const HTML_OPTIONS = {
  "include-passage-references": "false",
  "include-verse-numbers": "true",
  "include-first-verse-numbers": "true",
  "include-footnotes": "true",
  "include-footnote-body": "true",
  "include-headings": "true",
  "include-subheadings": "true",
  "include-short-copyright": "true",
  "include-copyright": "false",
  "include-passage-horizontal-lines": "false",
  "include-heading-horizontal-lines": "false",
  "include-selahs": "true",
  "include-css-link": "false",
  "inline-styles": "false",
  "wrapping-div": "false",
  "include-book-titles": "false",
  "include-verse-anchors": "false",
  "include-chapter-numbers": "true",
  "include-crossrefs": "false",
  "include-surrounding-chapters": "false",
  "include-surrounding-chapters-below": "false",
  "include-audio-link": "false",
};

const chapters = async (env, q, now) => {
  const b = book(q.get("book") ?? "");
  const c = parseInt(q.get("chapter") ?? "", 10);
  const count = parseInt(q.get("count") ?? "1", 10);
  if (!b || !(c >= 1 && c <= b[2].length) || !(count === 1 || count === 2) || String(c) !== q.get("chapter"))
    return fail(400, "bad_request", "No such chapter.");
  const n = chaptersFor(b, c, count);
  const spent = await spend(env, now);
  if (spent) return spent;
  // (Whole chapters by verse range: "3 John 1" alone is its first verse.)
  const passage = n === 2 ? `${b[1]} ${c}:1-${c + 1}:999` : `${b[1]} ${c}:1-999`;
  const got = await upstream(env, "/v3/passage/html/", { q: passage, ...HTML_OPTIONS });
  if (got.error) return got.error;
  const html = (got.body.passages ?? []).join("\n");
  const made = convert(html, b[0], c);
  return reply(200, {
    v: 1,
    version: "ESV",
    notice: made.notice || "(ESV)",
    chapters: made.chapters.map((ch) => ({ book: b[0], chapter: ch.chapter, verses: b[2][ch.chapter - 1], records: ch.records })),
  });
};

// "John 3:3", "1 John 3:9", "Song of Solomon 1:1": book, chapter, verse.
export const parseReference = (ref) => {
  const m = String(ref).match(/^(.+?) (\d+):(\d+)/);
  if (!m) return null;
  const name = m[1] === "Psalms" ? "Psalm" : m[1];
  const b = BOOKS.find((x) => x[1] === name);
  if (!b) return null;
  const c = parseInt(m[2], 10);
  const v = parseInt(m[3], 10);
  return { book: b[0], chapter: c, verse: v, key: keyOf(b[0], c, v) };
};

const search = async (env, q, now) => {
  const text = q.get("q") ?? "";
  const page = parseInt(q.get("page") ?? "1", 10);
  if (!text.trim() || text.length > 100 || !(page >= 1 && page <= 1000)) return fail(400, "bad_request", "No such search.");
  const spent = await spend(env, now);
  if (spent) return spent;
  const got = await upstream(env, "/v3/passage/search/", { q: text, "page-size": "100", page: String(page) });
  if (got.error) return got.error;
  return reply(200, searchReply(got.body));
};

export const searchReply = (body) => ({
  v: 1,
  total: body.total_results ?? 0,
  page: body.page ?? 1,
  pages: body.total_pages ?? 1,
  results: (body.results ?? [])
    .map((r) => {
      const ref = parseReference(r.reference);
      return ref && { ...ref, text: String(r.content ?? "").replace(/\s+/g, " ").trim() };
    })
    .filter(Boolean),
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The site (../site): www sent to the bare name, and anything not the API
    // the pages'.
    if (url.hostname === "www.smoothbible.com") {
      url.hostname = "smoothbible.com";
      return Response.redirect(url.toString(), 301);
    }
    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    }
    const path = url.pathname.replace(/^\/api\/v1\//, "/");
    if (request.method !== "GET") return fail(400, "bad_request", "Only GET.");
    if (path === "/status" || path === "/health") return reply(200, { ok: true, esv: Boolean(env.ESV_KEY) });
    if (!/^\S+ \(\S+\)$/.test(request.headers.get("x-smooth-bible") ?? "")) return fail(400, "bad_request", "Who is asking?");
    if (env.PER_IP) {
      const ip = request.headers.get("cf-connecting-ip") ?? "";
      const { success } = await env.PER_IP.limit({ key: ip });
      if (!success) return fail(429, "slow_down", "Too many requests from here.", 60);
    }
    const now = Date.now();
    if (path === "/esv/chapters") return chapters(env, url.searchParams, now);
    if (path === "/esv/search") return search(env, url.searchParams, now);
    return fail(400, "bad_request", "No such request.");
  },
};
