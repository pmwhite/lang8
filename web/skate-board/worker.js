// The skate game's leaderboards: a Cloudflare Worker at /skate/api/ with a
// D1 database behind it (schema.sql).
//
// A board is a list of best runs shared by whoever has its code (the link
// ?board=<code> on the game's page). Only its maker, holding the admin
// secret, can make a board, rotate its code, or delete from it. On a
// board, a name belongs to the device that first posted under it. Each
// entry carries its run as a replay, so anyone on the board can watch it.
//
//   GET  /board/<code>                         the board: every course's scores
//   GET  /board/<code>/replay?course=&name=    one run, to watch
//   POST /board/<code>/score                   {name, token, course, score, version, replay}
//   POST /admin/board    {title}               make a board            (admin)
//   POST /admin/rotate   {code}                give a board a new code (admin)
//   POST /admin/delete   {code, name?, course?} delete from a board    (admin)
//
// Scores are taken as sent: nothing here rides the replay to check it.

// The courses a board covers (and each day's: see dayOf), how many players
// it holds, and how long a replay may be.
const COURSES = 24;
const MAX_PLAYERS = 60;
const MAX_REPLAY = 150000;

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
const newCode = () => {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => letters[b % letters.length]).join("");
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
// A course a board covers: one of the first few, or a day's. To post to a
// day's it must be that day somewhere in the world.
const validCourse = (course) => whole(course, 1, COURSES) || dayOf(course) !== null;
const openCourse = (course) => whole(course, 1, COURSES) || (dayOf(course) !== null && Math.abs(Date.now() - dayOf(course) - DAY / 2) < DAY / 2 + 14 * 60 * 60 * 1000);
// Days' courses are kept this long.
const KEEP_DAYS = 30;
const dayNumber = (at) => {
  const d = new Date(at);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};
const validCode = (code) => typeof code === "string" && /^[a-z0-9]{8,24}$/.test(code);
// A name: capitals, digits, and single spaces between them (all the game's
// letters), twelve at most.
const validName = (name) => typeof name === "string" && /^[A-Z0-9]+( [A-Z0-9]+)*$/.test(name) && name.length <= 12;

async function board(env, code) {
  const row = await env.DB.prepare("SELECT title FROM boards WHERE code = ?").bind(code).first();
  if (!row) return fail(404, "no such board");
  const scores = await env.DB.prepare("SELECT course, name, score, version, at FROM scores WHERE board = ? ORDER BY course, score DESC, at")
    .bind(code).all();
  const courses = {};
  for (const s of scores.results) (courses[s.course] ??= []).push({ name: s.name, score: s.score, version: s.version, at: s.at });
  return reply(200, { title: row.title, courses });
}

async function replay(env, code, url) {
  const course = Number(url.searchParams.get("course"));
  const name = url.searchParams.get("name");
  if (!validCourse(course) || !validName(name)) return fail(400, "bad request");
  const row = await env.DB.prepare("SELECT score, version, replay FROM scores WHERE board = ? AND course = ? AND name = ?")
    .bind(code, course, name).first();
  if (!row) return fail(404, "no such run");
  return reply(200, { course, name, score: row.score, version: row.version, replay: row.replay });
}

async function post(env, code, body) {
  const { name, token, course, score, version, replay } = body ?? {};
  if (!validName(name) || typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return fail(400, "bad name or token");
  if (!openCourse(course) || !whole(score, 0, 10000000) || !whole(version, 1, 100000)) return fail(400, "bad score");
  if (typeof replay !== "string" || replay.length === 0 || replay.length > MAX_REPLAY || !/^[0-9a-z. ]+$/.test(replay)) return fail(400, "bad replay");
  if (!(await env.DB.prepare("SELECT 1 FROM boards WHERE code = ?").bind(code).first())) return fail(404, "no such board");
  // The name: this device's already, or free for it to take.
  const hash = await sha256(token);
  const player = await env.DB.prepare("SELECT token_hash FROM players WHERE board = ? AND name = ?").bind(code, name).first();
  if (player && player.token_hash !== hash) return fail(403, "that name is taken on this board");
  if (!player) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM players WHERE board = ?").bind(code).first();
    if (count.n >= MAX_PLAYERS) return fail(403, "this board is full");
    await env.DB.prepare("INSERT INTO players (board, name, token_hash, created) VALUES (?, ?, ?, ?)").bind(code, name, hash, Date.now()).run();
  }
  // Only a better run than their best on this course replaces it.
  const best = await env.DB.prepare("SELECT score FROM scores WHERE board = ? AND course = ? AND name = ?").bind(code, course, name).first();
  if (best && best.score >= score) return reply(200, { posted: false, best: best.score });
  await env.DB.prepare("INSERT OR REPLACE INTO scores (board, course, name, score, version, replay, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(code, course, name, score, version, replay, Date.now()).run();
  // (Old days' runs go as new ones come.)
  if (dayOf(course) !== null) {
    await env.DB.prepare("DELETE FROM scores WHERE board = ? AND course > ? AND course < ?").bind(code, 20000000, dayNumber(Date.now() - KEEP_DAYS * DAY)).run();
  }
  return reply(200, { posted: true, best: score });
}

async function admin(env, request, action, body) {
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!env.ADMIN_SECRET || (await sha256(given)) !== (await sha256(env.ADMIN_SECRET))) return fail(401, "not allowed");
  if (action === "board") {
    const title = typeof body?.title === "string" ? body.title.slice(0, 40) : "Friends";
    const code = newCode();
    await env.DB.prepare("INSERT INTO boards (code, title, created) VALUES (?, ?, ?)").bind(code, title, Date.now()).run();
    return reply(200, { code, title });
  }
  if (!validCode(body?.code)) return fail(400, "bad code");
  if (action === "rotate") {
    const code = newCode();
    const moved = await env.DB.batch([
      env.DB.prepare("UPDATE boards SET code = ? WHERE code = ?").bind(code, body.code),
      env.DB.prepare("UPDATE players SET board = ? WHERE board = ?").bind(code, body.code),
      env.DB.prepare("UPDATE scores SET board = ? WHERE board = ?").bind(code, body.code),
    ]);
    if (moved[0].meta.changes === 0) return fail(404, "no such board");
    return reply(200, { code });
  }
  if (action === "delete") {
    // A player's run on one course; or a player, and all their runs; or the
    // whole board.
    const statements = [];
    if (body.name !== undefined && body.course !== undefined) {
      statements.push(env.DB.prepare("DELETE FROM scores WHERE board = ? AND name = ? AND course = ?").bind(body.code, body.name, body.course));
    } else if (body.name !== undefined) {
      statements.push(env.DB.prepare("DELETE FROM scores WHERE board = ? AND name = ?").bind(body.code, body.name));
      statements.push(env.DB.prepare("DELETE FROM players WHERE board = ? AND name = ?").bind(body.code, body.name));
    } else {
      for (const table of ["scores", "players"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE board = ?`).bind(body.code));
      statements.push(env.DB.prepare("DELETE FROM boards WHERE code = ?").bind(body.code));
    }
    const done = await env.DB.batch(statements);
    return reply(200, { deleted: done.reduce((n, r) => n + r.meta.changes, 0) });
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
      if (parts[0] === "admin" && request.method === "POST") return await admin(env, request, parts[1], body);
      if (parts[0] === "board" && validCode(parts[1])) {
        if (request.method === "GET" && parts.length === 2) return await board(env, parts[1]);
        if (request.method === "GET" && parts[2] === "replay") {
          if (!(await env.DB.prepare("SELECT 1 FROM boards WHERE code = ?").bind(parts[1]).first())) return fail(404, "no such board");
          return await replay(env, parts[1], url);
        }
        if (request.method === "POST" && parts[2] === "score") return await post(env, parts[1], body);
      }
      return fail(404, "not found");
    } catch (e) {
      return fail(400, "bad request");
    }
  },
};
