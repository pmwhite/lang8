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
//   GET  /line?course=                        the best line found down a place     (anyone)
//   POST /admin/line {course, score, version, replay}   a line found: kept if it is the best
//   GET  /admin/last                          when each person last rode: {id: at}  (the admin)
//   POST /admin/unscore  {person, course?}    delete a person's runs (on one course, or all)
//   POST /report {kind, session, data}        how the game went on a device          (anyone)
//   GET  /admin/reports?kind=&person=&session=&limit=   the latest of those, newest first
//   POST /admin/unreport {before?}            delete them (those before a time, or all)
//   GET  /live   (a WebSocket)                riding together: see Live, below
//
// Scores are taken as sent: nothing here rides the replay to check it.
//
// A place's best line is no one's run: it is the best run a search of the
// game's own rules has found down it (see programs/skate/route.l8), posted
// by the admin, to watch. It is on no leaderboard.
//
// A report is what a device has to say of how the game went on it: an
// error, or how fast its frames came (see report, in web/skate/skate.js).
// It is kept with the time, the browser's name for itself, and whose link
// the device has, if any; not its address. They are for finding out what
// went wrong for someone, and are dropped after a while.

import { DurableObject } from "cloudflare:workers";
import { bearer, personOf, personWith, seenBy } from "../people-api/people.js";

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

// A place's best line (see the top of this file).
async function line(env, url) {
  const course = Number(url.searchParams.get("course"));
  if (!validCourse(course)) return fail(400, "bad request");
  const row = await env.DB.prepare("SELECT score, version, replay, at FROM lines WHERE course = ?").bind(course).first();
  if (!row) return fail(404, "no line");
  return reply(200, { course, score: row.score, version: row.version, replay: row.replay, at: row.at });
}

// A line found down a place: kept if it scores more than the one kept, or
// the one kept was found under older rules (a newer game's replaces it).
async function postLine(env, body) {
  const { course, score, version, replay } = body ?? {};
  if (!validCourse(course) || !whole(score, 1, 10000000) || !whole(version, 1, 100000)) return fail(400, "bad line");
  if (typeof replay !== "string" || replay.length === 0 || replay.length > MAX_REPLAY || !/^[0-9a-z. ]+$/.test(replay)) return fail(400, "bad replay");
  const kept = await env.DB.prepare("SELECT score, version FROM lines WHERE course = ?").bind(course).first();
  if (kept && (kept.version > version || (kept.version === version && kept.score >= score))) return reply(200, { kept: false, score: kept.score, version: kept.version });
  await env.DB.prepare("INSERT OR REPLACE INTO lines (course, score, version, replay, at) VALUES (?, ?, ?, ?, ?)").bind(course, score, version, replay, Date.now()).run();
  return reply(200, { kept: true, score, version });
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

// ---- riding together ----
// Riders at the same place see each other ride, live (see "together" in
// web/skate/skate.js). Each page keeps a WebSocket open to Live, one
// Durable Object for everyone (enough for a few friends at once), and says
// who it is and where it rides; Live passes each rider's state on to the
// others riding the same place who share a group with them, and tells
// everyone who is riding where. Nothing of it is kept.
//
// What a page says, each a message:
//   {"t":"hi","secret":S}      who it is (a person's secret: see ../people-api)
//   {"t":"at","place":N}       where it rides now (0: nowhere)
//   s FIELDS                   its rider's state, as its game says it (see
//                              say_state, in programs/skate/together.l8)
//   {"t":"score","round":K,"score":N,"full":B}   its score for a round of
//                              the place's (see rounds.l8), and whether it
//                              rode the whole of it
//   ping                       (answered pong, without waking Live)
// And what Live says to it:
//   {"t":"you","id":ID,"now":MS}                taken in, as this rider; and
//                              the time here, for all to keep rounds by
//   {"t":"no"}                                  its secret is nobody's
//   {"t":"room","place":N,"slot":S,"riders":[{id,name,slot}],"full"?}   where it now
//                              rides, its slot there, and who is there
//                              (nowhere, and full, if as many as can are)
//   {"t":"standings","riders":[{id,name,slot,last,avg}]}   the standings of
//                              those riding there, best average first
//   {"t":"join","id","name","slot"}             someone has come to ride there
//   {"t":"leave","id"}                          they have gone
//   {"t":"lobby","places":[{place,names}]}      who is riding where, of those it sees
//   s ID FIELDS                                 a rider's state
// A rider's slot is the least number no one else at that place has: it
// picks their color, the same on every page (see rider_color, in
// programs/skate/together.l8).
const LIVE_STATE = /^s [-0-9 ]{1,400}$/;
// (At most this many riders at a place, and states a second from one. And
// a socket that has said nothing, not even ping, for LIVE_QUIET ms is taken
// to be gone, whether or not its close has come: a phone put to sleep may
// never send one.)
const LIVE_ROOM = 16;
const LIVE_RATE = 40;
const LIVE_QUIET = 70000;
// Standings: each rider's last round, and an average of their whole rounds
// weighted to the latest by STANDING_WEIGHT (each new round counts for that
// share of it), begun at their first; so steady riding keeps a lead, and
// someone new is ranked from their first whole round. Kept only while
// Live is awake (riders riding keep it so), and someone's for a while
// after they were last at the place, in case they come back.
const STANDING_WEIGHT = 0.3;
const STANDING_KEEP = 15 * 60000;

export class Live extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Each socket's rider, as kept with it (which lasts while Live sleeps
    // between messages): {id, person, name, sees, place, slot, since}; and
    // states lately passed on from it, against LIVE_RATE, and when it was
    // last heard from (not kept: a fresh count after a sleep does no harm,
    // and a ping is answered without waking Live, and noted by the socket).
    this.riders = new Map();
    this.sent = new Map();
    this.heard = new Map();
    // place -> person -> {name, last, round, avg, at}
    this.standings = new Map();
    // (What each was last told of who is riding where: not told it again.)
    this.told = new Map();
    this.nextId = 1;
    for (const ws of ctx.getWebSockets()) {
      const rider = ws.deserializeAttachment();
      this.riders.set(ws, rider);
      this.nextId = Math.max(this.nextId, rider.id + 1);
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") return fail(426, "a WebSocket");
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.keep(server, { id: this.nextId++, name: null, sees: [], place: 0, slot: 0, since: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  keep(ws, rider) {
    this.riders.set(ws, rider);
    ws.serializeAttachment(rider);
  }

  // (A socket's rider, once it has said who it is.)
  known(ws) {
    const rider = this.riders.get(ws);
    return rider?.name ? rider : null;
  }

  // Whether a sees b: they share a group (or are one).
  sees(a, b) {
    return a.id === b.id || a.sees.includes(b.person);
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") return;
    const rider = this.riders.get(ws);
    if (!rider) return;
    const now = Date.now();
    this.heard.set(ws, now);
    if (message.startsWith("s ")) {
      if (!rider.place || !LIVE_STATE.test(message)) return;
      const sent = (this.sent.get(ws) ?? []).filter((at) => now - at < 1000);
      if (sent.length >= LIVE_RATE) return;
      sent.push(now);
      this.sent.set(ws, sent);
      const out = `s ${rider.id} ${message.slice(2)}`;
      for (const [other, them] of this.riders) {
        if (other !== ws && them.place === rider.place && this.sees(them, rider)) this.send(other, out);
      }
      return;
    }
    let said;
    try {
      said = JSON.parse(message);
    } catch {
      return;
    }
    if (said?.t === "hi") {
      if (rider.name) return;
      const person = await personWith(this.env, said.secret);
      // (It may have gone, or said who it is twice, while that was asked.)
      if (this.riders.get(ws)?.name !== null) return;
      if (!person) {
        this.send(ws, JSON.stringify({ t: "no" }));
        ws.close(4001, "no such link");
        return;
      }
      const sees = (await seenBy(this.env, person.id)).map((p) => p.id);
      if (this.riders.get(ws)?.name !== null) return;
      this.keep(ws, { ...rider, person: person.id, name: person.name, sees });
      this.send(ws, JSON.stringify({ t: "you", id: rider.id, now: Date.now() }));
      this.forgetQuiet();
      const lobby = this.lobbyFor(this.known(ws));
      this.told.set(ws, lobby);
      this.send(ws, lobby);
    } else if (said?.t === "at" && this.known(ws)) {
      const place = Number.isInteger(said.place) && Math.abs(said.place) < 2 ** 31 ? said.place : 0;
      this.moveTo(ws, place);
    } else if (said?.t === "score" && this.known(ws)?.place) {
      if (!Number.isInteger(said.round) || !Number.isInteger(said.score) || said.score < 0 || said.score > 10000000) return;
      this.scored(this.known(ws), said.round, said.score, said.full === true);
    }
  }

  // A rider goes to ride somewhere else (or nowhere): those at the place
  // left are told they have gone, and those at the new one that they have
  // come; and everyone, who is riding where.
  moveTo(ws, place) {
    this.forgetQuiet();
    const rider = this.known(ws);
    if (!rider || rider.place === place) return;
    this.leave(ws, rider);
    const there = [...this.riders].filter(([other, them]) => other !== ws && them.name && them.place === place);
    const full = place !== 0 && there.length >= LIVE_ROOM;
    if (full) place = 0;
    const taken = new Set(there.map(([, them]) => them.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    this.keep(ws, { ...rider, place, slot });
    // (Those left behind have one fewer in their standings.)
    if (rider.place) this.tellStandings(rider.place);
    const now = this.riders.get(ws);
    if (place !== 0) {
      const seen = there.filter(([, them]) => this.sees(now, them)).map(([, them]) => ({ id: them.id, name: them.name, slot: them.slot }));
      this.send(ws, JSON.stringify({ t: "room", place, slot, riders: seen }));
      const join = JSON.stringify({ t: "join", id: now.id, name: now.name, slot });
      for (const [other, them] of there) if (this.sees(them, now)) this.send(other, join);
      // (Everyone's standings there, his own among them if he has one.)
      this.tellStandings(place);
    } else this.send(ws, JSON.stringify({ t: "room", place: 0, riders: [], full }));
    this.tellLobby();
  }

  // A rider's score for a round of the place they ride: their standing
  // brought up to date (once a round), and told to those there.
  scored(rider, round, score, full) {
    const place = this.standings.get(rider.place) ?? this.standings.set(rider.place, new Map()).get(rider.place);
    const now = Date.now();
    for (const [person, s] of place) if (now - s.at > STANDING_KEEP) place.delete(person);
    const was = place.get(rider.person);
    if (was && round <= was.round) return;
    const avg = !full ? (was?.avg ?? null) : was?.avg == null ? score : STANDING_WEIGHT * score + (1 - STANDING_WEIGHT) * was.avg;
    place.set(rider.person, { name: rider.name, last: score, round, avg, at: now });
    this.tellStandings(rider.place);
  }

  // The standings at a place, of those riding there that each sees.
  tellStandings(place) {
    const kept = this.standings.get(place);
    if (!kept) return;
    const there = [...this.riders].filter(([, them]) => them.name && them.place === place);
    for (const [ws, rider] of there) {
      const riders = there
        .filter(([, them]) => this.sees(rider, them) && kept.has(them.person))
        .map(([, them]) => ({ id: them.id, name: them.name, slot: them.slot, last: kept.get(them.person).last, avg: kept.get(them.person).avg }))
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.last - a.last);
      this.send(ws, JSON.stringify({ t: "standings", riders: riders.map((r) => ({ ...r, avg: r.avg === null ? null : Math.round(r.avg) })) }));
    }
  }

  leave(ws, rider) {
    if (!rider.place) return;
    const gone = JSON.stringify({ t: "leave", id: rider.id });
    for (const [other, them] of this.riders) {
      if (other !== ws && them.place === rider.place && this.sees(them, rider)) this.send(other, gone);
    }
  }

  lobbyFor(rider) {
    const places = new Map();
    for (const them of this.riders.values()) {
      if (them.name && them.place && this.sees(rider, them)) (places.get(them.place) ?? places.set(them.place, []).get(them.place)).push(them.name);
    }
    return JSON.stringify({ t: "lobby", places: [...places].map(([place, names]) => ({ place, names })) });
  }

  tellLobby() {
    for (const [ws, rider] of this.riders) {
      if (!rider.name) continue;
      const lobby = this.lobbyFor(rider);
      if (this.told.get(ws) === lobby) continue;
      this.told.set(ws, lobby);
      this.send(ws, lobby);
    }
  }

  // (A socket closing as it is written to is no matter: it is let go of
  // when its close comes.)
  send(ws, text) {
    try {
      ws.send(text);
    } catch {}
  }

  gone(ws) {
    const rider = this.riders.get(ws);
    this.riders.delete(ws);
    this.sent.delete(ws);
    this.heard.delete(ws);
    this.told.delete(ws);
    if (!rider?.name) return;
    this.leave(ws, rider);
    if (!rider.place) return;
    this.tellLobby();
    this.tellStandings(rider.place);
  }

  // Let go of the sockets that have gone quiet (see LIVE_QUIET).
  forgetQuiet() {
    const now = Date.now();
    for (const [ws, rider] of [...this.riders]) {
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      if (now - Math.max(rider.since ?? 0, this.heard.get(ws) ?? 0, pinged) < LIVE_QUIET) continue;
      this.gone(ws);
      try {
        ws.close(4000, "quiet");
      } catch {}
    }
  }

  async webSocketClose(ws) {
    this.gone(ws);
  }

  async webSocketError(ws) {
    this.gone(ws);
  }
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
    // (Riding together: a WebSocket, to Live, which asks who it is itself.)
    if (parts[0] === "live" && parts.length === 1) return env.LIVE.get(env.LIVE.idFromName("live")).fetch(request);
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
        if (request.method === "POST" && parts[1] === "line") return await postLine(env, body);
        if (request.method === "POST") return await admin(env, parts[1], body);
        return fail(404, "not found");
      }
      // (A report is taken from anyone: something may go wrong for someone
      // with no link.)
      if (request.method === "POST" && parts[0] === "report") return await report(env, request, body);
      // (A best line is anyone's to watch.)
      if (request.method === "GET" && parts[0] === "line") return await line(env, url);
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
