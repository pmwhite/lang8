// The ESV proxy's tests (node --test programs/bible/worker/test.mjs): the
// converter over the fixtures (ESV-shaped HTML with the WEB's words), and
// the Worker against a mock ESV API, D1 and rate limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { convert, recordWords, htmlWords } from "./esv.js";
import worker, { BUDGET, buckets, chaptersFor } from "./worker.js";
import { BOOKS } from "./versecounts.js";

const here = new URL("./fixtures/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, here), "utf8");
const pages = readdirSync(here).filter((f) => f.endsWith(".html"));

test("each fixture converts to its records, its words unchanged", () => {
  assert.equal(pages.length, 8);
  for (const f of pages) {
    const [book, c] = f.replace(".html", "").split("-");
    const html = fixture(f);
    const made = convert(html, book, parseInt(c, 10));
    const records = made.chapters.map((ch) => ch.records).join("\n") + "\n";
    assert.equal(records, fixture(f.replace(".html", ".records")), f);
    assert.equal(recordWords(records), htmlWords(html), f + ": words");
    assert.equal(made.notice, "(ESV)");
    assert.match(records.split("\n")[0], /^SFixture: /);
  }
});

test("the ESV's own verse numbers are keyed as the BSB's", () => {
  assert.match(fixture("3JN-1.records"), /\nV15>14\n/);
  assert.match(fixture("REV-12.records"), /\nV18>17\n/);
});

test("a request spanning two chapters gives each its own records", () => {
  const two = fixture("JHN-3.html").replace(/<p>\(<a[^]*?<\/p>\n?$/, "") + fixture("JHN-4.html").replace(/<h2[^]*?<\/h2>/, "");
  const made = convert(two, "JHN", 3);
  assert.deepEqual(
    made.chapters.map((c) => c.chapter),
    [3, 4],
  );
  assert.match(made.chapters[1].records, /^(Pm\n)?V1\n/m);
});

// ---- the Worker ----
const mockDB = () => {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              assert.match(sql, /^INSERT INTO usage/);
              const results = args.map((b) => {
                rows.set(b, (rows.get(b) ?? 0) + 1);
                return { bucket: b, n: rows.get(b) };
              });
              return { results };
            },
            async run() {
              assert.match(sql, /^DELETE FROM usage/);
              for (const k of [...rows.keys()]) if (k.slice(2, 12) < args[0]) rows.delete(k);
              return {};
            },
          };
        },
      };
    },
  };
};

const env = (over = {}) => ({ DB: mockDB(), ESV_KEY: "test-key", UPSTREAM: "https://esv.test", PER_IP: { limit: async () => ({ success: true }) }, ...over });

let upstreamCalls = [];
const mockFetch = (status = 200, body = null) => {
  upstreamCalls = [];
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url: String(url), init });
    const u = new URL(url);
    if (body) return new Response(JSON.stringify(body), { status });
    if (u.pathname === "/v3/passage/search/") return new Response(fixture("search-born-again.json"), { status });
    return new Response(JSON.stringify({ passages: [fixture("JHN-3.html")] }), { status });
  };
};

const get = (e, path, header = "1.0 (12)") =>
  worker.fetch(new Request("https://smoothbible.com/api/v1/" + path, { headers: header ? { "x-smooth-bible": header } : {} }), e);

test("a chapter, through the mock ESV API", async () => {
  mockFetch();
  const r = await get(env(), "esv/chapters?book=JHN&chapter=3&count=1");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const j = await r.json();
  assert.equal(j.version, "ESV");
  assert.equal(j.notice, "(ESV)");
  assert.equal(j.chapters[0].book, "JHN");
  assert.equal(j.chapters[0].verses, 36);
  assert.equal(j.chapters[0].records + "\n", fixture("JHN-3.records"));
  assert.equal(upstreamCalls.length, 1);
  const u = new URL(upstreamCalls[0].url);
  assert.equal(u.origin, "https://esv.test");
  assert.equal(u.searchParams.get("q"), "John 3");
  assert.equal(u.searchParams.get("include-short-copyright"), "true");
  assert.equal(upstreamCalls[0].init.headers.authorization, "Token test-key");
});

test("count is cut to 1 where two chapters would pass the terms", () => {
  const book = (c) => BOOKS.find((b) => b[0] === c);
  // Joel 2-3 (32 + 21 of 73): more than half the book.
  assert.equal(chaptersFor(book("JOL"), 2, 2), 1);
  assert.equal(chaptersFor(book("JHN"), 3, 2), 2);
  // Psalm 119 and 120 pass 500? No (176 + 7); the book's end: one.
  assert.equal(chaptersFor(book("REV"), 22, 2), 1);
  assert.equal(chaptersFor(book("JUD"), 1, 2), 1);
});

test("Joel 2-3 is asked for as Joel 2 alone", async () => {
  mockFetch();
  await get(env(), "esv/chapters?book=JOL&chapter=2&count=2");
  assert.equal(new URL(upstreamCalls[0].url).searchParams.get("q"), "Joel 2");
  await get(env(), "esv/chapters?book=JHN&chapter=3&count=2");
  assert.equal(new URL(upstreamCalls[1].url).searchParams.get("q"), "John 3-4");
});

test("bad requests and a missing header are 400s", async () => {
  mockFetch();
  for (const q of ["esv/chapters?book=XYZ&chapter=1", "esv/chapters?book=JHN&chapter=22", "esv/chapters?book=JHN&chapter=3&count=3", "esv/search?q=" + "a".repeat(101), "nothing"]) {
    const r = await get(env(), q);
    assert.equal(r.status, 400, q);
    assert.equal((await r.json()).error, "bad_request");
  }
  const r = await get(env(), "esv/chapters?book=JHN&chapter=3", null);
  assert.equal(r.status, 400);
  assert.equal(upstreamCalls.length, 0);
});

test("status answers without asking the ESV", async () => {
  mockFetch();
  const r = await get(env(), "status", null);
  assert.deepEqual(await r.json(), { ok: true, esv: true });
  assert.equal(upstreamCalls.length, 0);
});

test("each limit gives its error", async () => {
  mockFetch();
  // One address, too often.
  let r = await get(env({ PER_IP: { limit: async () => ({ success: false }) } }), "esv/chapters?book=JHN&chapter=3");
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "slow_down", message: "Too many requests from here.", retry: 60 });
  // The minute's budget, then the hour's, then the day's.
  const now = Date.now();
  const k = buckets(now);
  for (const [bucket, n, status, error] of [
    [k.m, BUDGET.minute, 429, "busy"],
    [k.h, BUDGET.hour, 429, "busy"],
    [k.d, BUDGET.day, 503, "daily_limit"],
  ]) {
    const e = env();
    e.DB.rows.set(bucket, n);
    r = await get(e, "esv/chapters?book=JHN&chapter=3");
    assert.equal(r.status, status, bucket);
    const j = await r.json();
    assert.equal(j.error, error);
    assert.ok(j.retry > 0);
  }
  // The ESV API's own 429 is busy; anything else not 200 is upstream.
  mockFetch(429, {});
  r = await get(env(), "esv/chapters?book=JHN&chapter=3");
  assert.equal((await r.json()).error, "busy");
  mockFetch(500, {});
  r = await get(env(), "esv/chapters?book=JHN&chapter=3");
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, "upstream");
  // No answer: a timeout (the abort, at once here).
  globalThis.fetch = async () => {
    throw new Error("aborted");
  };
  r = await get(env(), "esv/chapters?book=JHN&chapter=3");
  assert.equal(r.status, 504);
  assert.equal((await r.json()).error, "timeout");
});

test("a day's first call lets go of buckets two days old", async () => {
  mockFetch();
  const e = env();
  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  e.DB.rows.set("m:" + old.slice(0, 16), 3);
  e.DB.rows.set("h:" + old.slice(0, 13), 3);
  e.DB.rows.set("d:" + old.slice(0, 10), 3);
  await get(e, "esv/chapters?book=JHN&chapter=3");
  assert.deepEqual([...e.DB.rows.keys()].sort(), Object.values(buckets(Date.now())).filter((x) => typeof x === "string" && x[1] === ":").sort());
  // (The day's second call keeps what there is.)
  await get(e, "esv/chapters?book=JHN&chapter=3");
  assert.equal(e.DB.rows.size, 3);
});

test("a search, its references as codes and keys", async () => {
  mockFetch();
  const r = await get(env(), "esv/search?q=born%20again&page=1");
  assert.equal(r.headers.get("cache-control"), "no-store");
  const j = await r.json();
  assert.equal(j.total, 12);
  assert.deepEqual(j.results[0], { book: "JHN", chapter: 3, verse: 3, key: 3, text: j.results[0].text });
  assert.equal(j.results[6].book, "1PE");
  assert.equal(new URL(upstreamCalls[0].url).searchParams.get("page-size"), "100");
});
