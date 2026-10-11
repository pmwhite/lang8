// The skate game's leaderboards: a Cloudflare Worker at /skate/api/ with a
// D1 database behind it (schema.sql).
//
// People and groups are made by the admin, who holds the admin secret (see
// web/skate/admin.html). A person has a link: the game's page with their
// secret after the #. Whoever opens it plays as them, on any device, so it
// is theirs alone to keep; the admin can give them a new one, and the old
// one stops working. A group is a list of people, and only the admin knows
// of it: all it does is decide who sees whom. A person sees themselves and
// everyone they share a group with, and nobody else: those people's best
// run on each course, one each, with the run itself as a replay to watch,
// and their latest runs there. Nobody joins anything.
//
//   GET  /me                                  who I am, and the scores of those I see  (a person)
//   POST /score  {course, score, version, replay}   a run of mine              (a person)
//   GET  /replay?person=&course=              a best run, of someone I see
//   GET  /admin/all                           every person and group            (the admin)
//   POST /admin/person   {name}               make a person: {id, name, secret}
//   POST /admin/relink   {id}                 a new secret for them
//   POST /admin/rename   {id, name}
//   POST /admin/unperson {id}                 delete a person, and their runs
//   POST /admin/group    {title}              make a group: {id, title}
//   POST /admin/retitle  {id, title}
//   POST /admin/ungroup  {id}
//   POST /admin/member   {group, person, on}  put a person in a group, or take them out
//   POST /admin/unscore  {person, course?}    delete a person's runs (on one course, or all)
//
// Scores are taken as sent: nothing here rides the replay to check it.

// The courses scores are kept for, and as many parks (and each day's course
// and park: see dayOf); how many people and groups there may be; how long a
// replay may be; and how many of a person's latest runs on a course are
// kept, and of everyone's shown.
const COURSES = 5;
const MAX_PEOPLE = 200;
const MAX_GROUPS = 40;
const MAX_REPLAY = 150000;
const KEEP_RUNS = 10;
const RECENT = 20;

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
// Random letters and digits (none that look alike): 24 make a secret, 8 an
// id.
const random = (n) => {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => letters[b % letters.length]).join("");
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
const validPlace = (n) => whole(n, 1, COURSES) || dayOf(n) !== null;
const openPlace = (n) => whole(n, 1, COURSES) || (dayOf(n) !== null && Math.abs(Date.now() - dayOf(n) - DAY / 2) < DAY / 2 + 14 * 60 * 60 * 1000);
const validCourse = (course) => Number.isInteger(course) && validPlace(Math.abs(course));
const openCourse = (course) => Number.isInteger(course) && openPlace(Math.abs(course));
// Days' runs are kept this long.
const KEEP_DAYS = 30;
const dayNumber = (at) => {
  const d = new Date(at);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};
const validId = (id) => typeof id === "string" && /^[a-z0-9]{8}$/.test(id);
// A name: capitals, digits, and single spaces between them (all the game's
// letters), twelve at most.
const validName = (name) => typeof name === "string" && /^[A-Z0-9]+( [A-Z0-9]+)*$/.test(name) && name.length <= 12;
const validTitle = (title) => typeof title === "string" && title.trim().length > 0 && title.length <= 30;

const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
// Whose secret the request carries: {id, name}, or null.
const personOf = async (env, request) => {
  const secret = bearer(request);
  if (!/^[a-z0-9]{24}$/.test(secret)) return null;
  return await env.DB.prepare("SELECT id, name FROM people WHERE secret = ?").bind(secret).first();
};

// Who he is, and the scores of those he sees (himself, and everyone he
// shares a group with): their bests on each course (best first), and their
// latest runs there (newest first). Nothing of the groups themselves.
const seen = (person) => `(${person} = ?1 OR ${person} IN (SELECT m2.person FROM members m1 JOIN members m2 ON m1.grp = m2.grp WHERE m1.person = ?1))`;
async function me(env, who) {
  const bests = await env.DB.prepare(
    `SELECT b.course, p.id, p.name, b.score, b.version, b.at FROM bests b JOIN people p ON p.id = b.person WHERE ${seen("b.person")} ORDER BY b.course, b.score DESC, b.at`
  ).bind(who.id).all();
  const courses = {};
  for (const s of bests.results) (courses[s.course] ??= []).push({ id: s.id, name: s.name, score: s.score, version: s.version, at: s.at });
  const runs = await env.DB.prepare(
    `SELECT l.course, p.name, l.score, l.version, l.at FROM log l JOIN people p ON p.id = l.person WHERE ${seen("l.person")} ORDER BY l.course, l.at DESC`
  ).bind(who.id).all();
  const recent = {};
  for (const s of runs.results) {
    const list = (recent[s.course] ??= []);
    if (list.length < RECENT) list.push({ name: s.name, score: s.score, version: s.version, at: s.at });
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
  const old = dayNumber(now - KEEP_DAYS * DAY);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO log (person, course, score, version, at) VALUES (?, ?, ?, ?, ?)").bind(who.id, course, score, version, now),
    // (Only his latest few on the course are kept, and no days long past.)
    env.DB.prepare("DELETE FROM log WHERE person = ? AND course = ? AND at < (SELECT at FROM log WHERE person = ? AND course = ? ORDER BY at DESC LIMIT 1 OFFSET ?)")
      .bind(who.id, course, who.id, course, KEEP_RUNS - 1),
    env.DB.prepare("DELETE FROM log WHERE person = ? AND ABS(course) > 20000000 AND ABS(course) < ?").bind(who.id, old),
    env.DB.prepare("DELETE FROM bests WHERE person = ? AND ABS(course) > 20000000 AND ABS(course) < ?").bind(who.id, old),
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
  if (whose !== who.id) {
    const shared = await env.DB.prepare("SELECT 1 FROM members a JOIN members b ON a.grp = b.grp WHERE a.person = ? AND b.person = ?").bind(who.id, whose).first();
    if (!shared) return fail(404, "no such run");
  }
  const row = await env.DB.prepare("SELECT b.score, b.version, b.replay, p.name FROM bests b JOIN people p ON p.id = b.person WHERE b.person = ? AND b.course = ?")
    .bind(whose, course).first();
  if (!row) return fail(404, "no such run");
  return reply(200, { course, name: row.name, score: row.score, version: row.version, replay: row.replay });
}

// Everything, for the admin's page: each person (with their secret, to
// share their link again; the groups they are in; and when they last rode),
// and each group.
async function all(env) {
  const people = await env.DB.prepare("SELECT id, name, secret, created FROM people ORDER BY created").all();
  const groups = await env.DB.prepare("SELECT id, title FROM grps ORDER BY created").all();
  const members = await env.DB.prepare("SELECT grp, person FROM members").all();
  const last = await env.DB.prepare("SELECT person, MAX(at) AS at FROM log GROUP BY person").all();
  const seen = Object.fromEntries(last.results.map((r) => [r.person, r.at]));
  return reply(200, {
    people: people.results.map((p) => ({ ...p, groups: members.results.filter((m) => m.person === p.id).map((m) => m.grp), last: seen[p.id] ?? null })),
    groups: groups.results,
  });
}

async function admin(env, action, body) {
  const db = env.DB;
  if (action === "person") {
    if (!validName(body?.name)) return fail(400, "bad name");
    if (await db.prepare("SELECT 1 FROM people WHERE name = ?").bind(body.name).first()) return fail(409, "that name is taken");
    if ((await db.prepare("SELECT COUNT(*) AS n FROM people").first()).n >= MAX_PEOPLE) return fail(403, "too many people");
    const person = { id: random(8), name: body.name, secret: random(24) };
    await db.prepare("INSERT INTO people (id, name, secret, created) VALUES (?, ?, ?, ?)").bind(person.id, person.name, person.secret, Date.now()).run();
    return reply(200, person);
  }
  if (action === "group") {
    if (!validTitle(body?.title)) return fail(400, "bad title");
    if ((await db.prepare("SELECT COUNT(*) AS n FROM grps").first()).n >= MAX_GROUPS) return fail(403, "too many groups");
    const group = { id: random(8), title: body.title.trim() };
    await db.prepare("INSERT INTO grps (id, title, created) VALUES (?, ?, ?)").bind(group.id, group.title, Date.now()).run();
    return reply(200, group);
  }
  if (action === "member") {
    if (!validId(body?.group) || !validId(body?.person)) return fail(400, "bad request");
    const both = await db.prepare("SELECT (SELECT 1 FROM grps WHERE id = ?) AS g, (SELECT 1 FROM people WHERE id = ?) AS p").bind(body.group, body.person).first();
    if (!both.g || !both.p) return fail(404, "no such group or person");
    if (body.on) await db.prepare("INSERT OR IGNORE INTO members (grp, person) VALUES (?, ?)").bind(body.group, body.person).run();
    else await db.prepare("DELETE FROM members WHERE grp = ? AND person = ?").bind(body.group, body.person).run();
    return reply(200, { on: !!body.on });
  }
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
  // The rest are of one person, or one group.
  if (!validId(body?.id)) return fail(400, "bad request");
  const changed = (r) => (r.meta.changes === 0 ? fail(404, "no such one") : null);
  if (action === "relink") {
    const secret = random(24);
    return changed(await db.prepare("UPDATE people SET secret = ? WHERE id = ?").bind(secret, body.id).run()) ?? reply(200, { id: body.id, secret });
  }
  if (action === "rename") {
    if (!validName(body.name)) return fail(400, "bad name");
    if (await db.prepare("SELECT 1 FROM people WHERE name = ? AND id != ?").bind(body.name, body.id).first()) return fail(409, "that name is taken");
    return changed(await db.prepare("UPDATE people SET name = ? WHERE id = ?").bind(body.name, body.id).run()) ?? reply(200, { id: body.id, name: body.name });
  }
  if (action === "unperson") {
    const done = await db.batch([
      db.prepare("DELETE FROM people WHERE id = ?").bind(body.id),
      db.prepare("DELETE FROM members WHERE person = ?").bind(body.id),
      db.prepare("DELETE FROM bests WHERE person = ?").bind(body.id),
      db.prepare("DELETE FROM log WHERE person = ?").bind(body.id),
    ]);
    return changed(done[0]) ?? reply(200, { deleted: true });
  }
  if (action === "retitle") {
    if (!validTitle(body.title)) return fail(400, "bad title");
    return changed(await db.prepare("UPDATE grps SET title = ? WHERE id = ?").bind(body.title.trim(), body.id).run()) ?? reply(200, { id: body.id, title: body.title.trim() });
  }
  if (action === "ungroup") {
    const done = await db.batch([db.prepare("DELETE FROM grps WHERE id = ?").bind(body.id), db.prepare("DELETE FROM members WHERE grp = ?").bind(body.id)]);
    return changed(done[0]) ?? reply(200, { deleted: true });
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
        if (request.method === "GET" && parts[1] === "all") return await all(env);
        if (request.method === "POST") return await admin(env, parts[1], body);
        return fail(404, "not found");
      }
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
