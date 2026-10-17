// The skate game's leaderboards: a Cloudflare Worker at /skate/api/ with a
// D1 database behind it (schema.sql).
//
// People and groups are those every game shares (see ../people-api): this
// Worker asks their database, bound as PEOPLE, whose link a request
// carries and whom they see. A person sees themselves and everyone they
// share a group with, and nobody else: those people's best run on each
// course, one each, with the run itself as a replay to watch, and their
// latest runs there.
//
//   GET  /me                                  who I am, and the scores of those I see  (a person)
//   POST /score  {course, score, version, replay}   a run of mine              (a person)
//   GET  /replay?person=&course=              a best run, of someone I see
//   GET  /admin/last                          when each person last rode: {id: at}  (the admin)
//   POST /admin/unscore  {person, course?}    delete a person's runs (on one course, or all)
//   POST /report {kind, session, data}        how the game went on a device          (anyone)
//   GET  /admin/reports?kind=&person=&session=&limit=   the latest of those, newest first
//   POST /admin/unreport {before?}            delete them (those before a time, or all)
//
// Scores are taken as sent: nothing here rides the replay to check it.
//
// A report is what a device has to say of how the game went on it: an
// error, or how fast its frames came (see report, in web/skate/skate.js).
// It is kept with the time, the browser's name for itself, and whose link
// the device has, if any; not its address. They are for finding out what
// went wrong for someone, and are dropped after a while.

import { bearer, personOf, seenBy } from "../people-api/people.js";

// The courses scores are kept for, and as many parks (and each day's course
// and park: see dayOf); how long a replay may be; and how many of a
// person's latest runs on a course are kept, and of everyone's shown.
const COURSES = 5;
const MAX_REPLAY = 150000;
const KEEP_RUNS = 10;
const RECENT = 20;
// Reports: the kinds there are, how long one may be, how many one visit to
// the page may send, and how many are kept, for how many days.
const REPORT_KINDS = ["error", "perf"];
const MAX_REPORT = 6000;
const SESSION_REPORTS = 40;
const KEEP_REPORTS = 5000;
const KEEP_REPORT_DAYS = 30;

const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const fail = (status, error) => reply(status, { error });

const sha256 = async (text) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// A day's course has its date for its number, as 20261010 (the page reckons
// the day in one time zone for everyone). When it was, or null if it is no
// date.
const dayOf = (course) => {
  if (!whole(course, 20000101, 29991231)) return null;
  const [y, m, d] = [Math.floor(course / 10000), Math.floor(course / 100) % 100, course % 100];
  const at = Date.UTC(y, m - 1, d);
  const back = new Date(at);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? at : null;
};
const DAY = 24 * 60 * 60 * 1000;
// A course scores are kept for: one of the first few, or a day's. To post
// to a day's it must be that day somewhere in the world.
// (A park's number is its course's, negative: park 3 is -3, and a day's park
// its date, negative.)
// (And big air's: numbered from BIG_AIR, as the page has them.)
const BIG_AIR = 200000000;
const validPlace = (n) => whole(n, 1, COURSES) || whole(n, BIG_AIR + 1, BIG_AIR + COURSES) || dayOf(n) !== null;
// (A day's place takes runs on its day alone, the day being everyone's
// one day, where the page keeps it: see DAILY_ZONE there; with a few
// minutes' grace for a run begun before midnight.)
const DAILY_ZONE = "America/New_York";
const dayNow = (at) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_ZONE }).format(new Date(at)).replace(/-/g, ""));
const GRACE = 5 * 60 * 1000;
const openPlace = (n) => whole(n, 1, COURSES) || whole(n, BIG_AIR + 1, BIG_AIR + COURSES) || (dayOf(n) !== null && (dayNow(Date.now()) === n || dayNow(Date.now() - GRACE) === n));
const validCourse = (course) => Number.isInteger(course) && validPlace(Math.abs(course));
const openCourse = (course) => Number.isInteger(course) && openPlace(Math.abs(course));
const validId = (id) => typeof id === "string" && /^[a-z0-9]{8}$/.test(id);

// Who he is, and the scores of those he sees (himself, and everyone he
// shares a group with): their bests on each course (best first), and their
// latest runs there (newest first). Nothing of the groups themselves.
async function me(env, who) {
  const seen = await seenBy(env, who.id);
  const names = Object.fromEntries(seen.map((p) => [p.id, p.name]));
  const ids = JSON.stringify(seen.map((p) => p.id));
  const bests = await env.DB.prepare(
    "SELECT course, person, score, version, at FROM bests WHERE person IN (SELECT value FROM json_each(?)) ORDER BY course, score DESC, at"
  ).bind(ids).all();
  const courses = {};
  for (const s of bests.results) (courses[s.course] ??= []).push({ id: s.person, name: names[s.person], score: s.score, version: s.version, at: s.at });
  const runs = await env.DB.prepare(
    "SELECT course, person, score, version, at FROM log WHERE person IN (SELECT value FROM json_each(?)) ORDER BY course, at DESC"
  ).bind(ids).all();
  const recent = {};
  for (const s of runs.results) {
    const list = (recent[s.course] ??= []);
    if (list.length < RECENT) list.push({ name: names[s.person], score: s.score, version: s.version, at: s.at });
  }
  return reply(200, { id: who.id, name: who.name, courses, recent });
}

// A run of his: logged, and kept as his best on the course if it is (or if
// his best was under older rules, which a newer game's run replaces).
async function post(env, who, body) {
  const { course, score, version, replay } = body ?? {};
  if (!openCourse(course) || !whole(score, 1, 10000000) || !whole(version, 1, 100000)) return fail(400, "bad score");
  if (typeof replay !== "string" || replay.length === 0 || replay.length > MAX_REPLAY || !/^[0-9a-z. ]+$/.test(replay)) return fail(400, "bad replay");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO log (person, course, score, version, at) VALUES (?, ?, ?, ?, ?)").bind(who.id, course, score, version, now),
    // (Only his latest few on the course are kept. Days gone by are kept
    // for good: their boards stand.)
    env.DB.prepare("DELETE FROM log WHERE person = ? AND course = ? AND at < (SELECT at FROM log WHERE person = ? AND course = ? ORDER BY at DESC LIMIT 1 OFFSET ?)")
      .bind(who.id, course, who.id, course, KEEP_RUNS - 1),
  ]);
  const best = await env.DB.prepare("SELECT score, version FROM bests WHERE person = ? AND course = ?").bind(who.id, course).first();
  if (best && best.version >= version && best.score >= score) return reply(200, { best: false, score: best.score });
  await env.DB.prepare("INSERT OR REPLACE INTO bests (person, course, score, version, replay, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(who.id, course, score, version, replay, now).run();
  return reply(200, { best: true, score });
}

// Someone's best run on a course, to watch: his own, or that of someone he
// shares a group with.
async function replay(env, who, url) {
  const course = Number(url.searchParams.get("course"));
  const whose = url.searchParams.get("person");
  if (!validCourse(course) || !validId(whose)) return fail(400, "bad request");
  const rider = (await seenBy(env, who.id)).find((p) => p.id === whose);
  if (!rider) return fail(404, "no such run");
  const row = await env.DB.prepare("SELECT score, version, replay FROM bests WHERE person = ? AND course = ?").bind(whose, course).first();
  if (!row) return fail(404, "no such run");
  return reply(200, { course, name: rider.name, score: row.score, version: row.version, replay: row.replay });
}

// A device's report, kept (see the top of this file).
async function report(env, request, body) {
  const { kind, session, data } = body ?? {};
  if (!REPORT_KINDS.includes(kind) || typeof session !== "string" || !/^[a-z0-9]{6,12}$/.test(session)) return fail(400, "bad report");
  if (data === null || typeof data !== "object" || Array.isArray(data)) return fail(400, "bad report");
  const text = JSON.stringify(data);
  if (text.length > MAX_REPORT) return fail(413, "too big");
  const sent = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE session = ?").bind(session).first();
  if (sent.n >= SESSION_REPORTS) return fail(429, "enough");
  const who = bearer(request) ? await personOf(env, request) : null;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO reports (at, kind, person, session, agent, data) VALUES (?, ?, ?, ?, ?, ?)").bind(
      now,
      kind,
      who?.id ?? null,
      session,
      (request.headers.get("user-agent") ?? "").slice(0, 300),
      text
    ),
    env.DB.prepare("DELETE FROM reports WHERE at < ? OR id <= (SELECT MAX(id) FROM reports) - ?").bind(now - KEEP_REPORT_DAYS * DAY, KEEP_REPORTS),
  ]);
  return reply(200, { ok: true });
}

// The latest reports, newest first: of one kind, person (by id or name), or
// visit, if asked.
async function reports(env, url) {
  const q = url.searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 50, 1), 500);
  const people = await env.PEOPLE.prepare("SELECT id, name FROM people").all();
  const names = Object.fromEntries(people.results.map((p) => [p.id, p.name]));
  // (A person asked for by name is asked for by their id.)
  const person = q.get("person");
  const named = person && people.results.find((p) => p.name === person)?.id;
  const rows = await env.DB.prepare(
    `SELECT id, at, kind, person, session, agent, data FROM reports
     WHERE (?1 IS NULL OR kind = ?1) AND (?2 IS NULL OR person = ?2) AND (?3 IS NULL OR session = ?3)
     ORDER BY id DESC LIMIT ?4`
  )
    .bind(q.get("kind"), named || person, q.get("session"), limit)
    .all();
  return reply(200, { reports: rows.results.map((r) => ({ ...r, name: names[r.person] ?? null, data: JSON.parse(r.data) })) });
}

// When each person last rode, for the admin's page (see ../people/admin.html).
async function last(env) {
  const rows = await env.DB.prepare("SELECT person, MAX(at) AS at FROM log GROUP BY person").all();
  return reply(200, Object.fromEntries(rows.results.map((r) => [r.person, r.at])));
}

async function admin(env, action, body) {
  const db = env.DB;
  if (action === "unscore") {
    if (!validId(body?.person) || (body.course !== undefined && !validCourse(body.course))) return fail(400, "bad request");
    const done = await db.batch(
      ["bests", "log"].map((table) =>
        body.course === undefined
          ? db.prepare(`DELETE FROM ${table} WHERE person = ?`).bind(body.person)
          : db.prepare(`DELETE FROM ${table} WHERE person = ? AND course = ?`).bind(body.person, body.course)
      )
    );
    return reply(200, { deleted: done.reduce((n, r) => n + r.meta.changes, 0) });
  }
  if (action === "unreport") {
    const before = body?.before === undefined ? Date.now() + DAY : body.before;
    if (!Number.isFinite(before)) return fail(400, "bad request");
    const done = await db.prepare("DELETE FROM reports WHERE at < ?").bind(before).run();
    return reply(200, { deleted: done.meta.changes });
  }
  return fail(404, "no such action");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/skate\/api/, "").split("/").filter(Boolean);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    // Not too often from one address (which is not kept).
    if (env.LIMIT) {
      const { success } = await env.LIMIT.limit({ key: request.headers.get("cf-connecting-ip") ?? "" });
      if (!success) return fail(429, "slow down");
    }
    try {
      let body = null;
      if (request.method === "POST") {
        const text = await request.text();
        if (text.length > MAX_REPLAY + 2000) return fail(413, "too big");
        body = JSON.parse(text);
      }
      if (parts[0] === "admin") {
        if (!env.ADMIN_SECRET || (await sha256(bearer(request))) !== (await sha256(env.ADMIN_SECRET))) return fail(401, "not allowed");
        if (request.method === "GET" && parts[1] === "last") return await last(env);
        if (request.method === "GET" && parts[1] === "reports") return await reports(env, url);
        if (request.method === "POST") return await admin(env, parts[1], body);
        return fail(404, "not found");
      }
      // (A report is taken from anyone: something may go wrong for someone
      // with no link.)
      if (request.method === "POST" && parts[0] === "report") return await report(env, request, body);
      const who = await personOf(env, request);
      if (!who) return fail(401, "no such link");
      if (request.method === "GET" && parts[0] === "me") return await me(env, who);
      if (request.method === "GET" && parts[0] === "replay") return await replay(env, who, url);
      if (request.method === "POST" && parts[0] === "score") return await post(env, who, body);
      return fail(404, "not found");
    } catch (e) {
      console.error(e);
      return fail(400, "bad request");
    }
  },
};
