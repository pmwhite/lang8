// The people every game shares: a Cloudflare Worker at /people/api/ with a
// D1 database behind it (schema.sql).
//
// People and groups are made by the admin, who holds the admin secret (see
// web/people/admin.html). A person has a link: a game's page with their
// secret after the #. Whoever opens it plays as them, in every game, on
// any device, so it is theirs alone to keep; the admin can give them a new
// one, and the old one stops working. A group is a list of people, and
// only the admin knows of it: all it does is decide who sees whom. Nobody
// joins anything.
//
// Each game does with them what it does with its own Worker, which asks
// this database who is who (see people.js); or, a game with no Worker of
// its own, keeps what it must of a person here (a save: see below).
//
//   GET  /me                                  who I am                         (a person)
//   GET  /save?game=&slot=                    a save of mine: {data, at}, or {data: null}
//   POST /save  {game, slot, data}            keep it
//   GET  /admin/all                           every person (with their saves' sizes) and group  (the admin)
//   POST /admin/person   {name}               make a person: {id, name, secret}
//   POST /admin/relink   {id}                 a new secret for them
//   POST /admin/rename   {id, name}
//   POST /admin/unperson {id}                 delete a person, and their saves (each game's
//                                             Worker deletes its own of them)
//   POST /admin/group    {title}              make a group: {id, title}
//   POST /admin/retitle  {id, title}
//   POST /admin/ungroup  {id}
//   POST /admin/member   {group, person, on}  put a person in a group, or take them out
//   POST /admin/unsave   {person, game}       delete a person's saves of a game
import { bearer, personOf } from "./people.js";

// How many people and groups there may be; the games that keep saves here;
// how long a save may be, and how many slots a person may have of a game.
const MAX_PEOPLE = 200;
const MAX_GROUPS = 40;
const GAMES = ["blocks"];
const MAX_SAVE = 20000;
const MAX_SLOTS = 20;

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
const validId = (id) => typeof id === "string" && /^[a-z0-9]{8}$/.test(id);
// A name: capitals, digits, and single spaces between them (all the skate
// game's letters), twelve at most.
const validName = (name) => typeof name === "string" && /^[A-Z0-9]+( [A-Z0-9]+)*$/.test(name) && name.length <= 12;
const validTitle = (title) => typeof title === "string" && title.trim().length > 0 && title.length <= 30;
const validGame = (game) => GAMES.includes(game);
const validSlot = (slot) => typeof slot === "string" && /^[a-z0-9._-]{1,40}$/.test(slot);

async function load(env, who, url) {
  const game = url.searchParams.get("game");
  const slot = url.searchParams.get("slot");
  if (!validGame(game) || !validSlot(slot)) return fail(400, "bad request");
  const row = await env.PEOPLE.prepare("SELECT data, at FROM saves WHERE person = ? AND game = ? AND slot = ?").bind(who.id, game, slot).first();
  return reply(200, row ?? { data: null, at: null });
}

async function save(env, who, body) {
  const { game, slot, data } = body ?? {};
  if (!validGame(game) || !validSlot(slot)) return fail(400, "bad request");
  if (typeof data !== "string" || data.length > MAX_SAVE) return fail(400, "bad save");
  const db = env.PEOPLE;
  const slots = await db.prepare("SELECT COUNT(*) AS n, SUM(slot = ?) AS here FROM saves WHERE person = ? AND game = ?").bind(slot, who.id, game).first();
  if (!slots.here && slots.n >= MAX_SLOTS) return fail(403, "too many saves");
  const at = Date.now();
  await db.prepare("INSERT OR REPLACE INTO saves (person, game, slot, data, at) VALUES (?, ?, ?, ?, ?)").bind(who.id, game, slot, data, at).run();
  return reply(200, { at });
}

// Everything, for the admin's page: each person (with their secret, to
// share their link again; the groups they are in; and their saves, each
// its game, slot, size, and when), and each group.
async function all(env) {
  const db = env.PEOPLE;
  const people = await db.prepare("SELECT id, name, secret, created FROM people ORDER BY created").all();
  const groups = await db.prepare("SELECT id, title FROM grps ORDER BY created").all();
  const members = await db.prepare("SELECT grp, person FROM members").all();
  const saves = await db.prepare("SELECT person, game, slot, LENGTH(data) AS size, at FROM saves ORDER BY at DESC").all();
  return reply(200, {
    people: people.results.map((p) => ({
      ...p,
      groups: members.results.filter((m) => m.person === p.id).map((m) => m.grp),
      saves: saves.results.filter((s) => s.person === p.id).map(({ person, ...s }) => s),
    })),
    groups: groups.results,
  });
}

async function admin(env, action, body) {
  const db = env.PEOPLE;
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
  if (action === "unsave") {
    if (!validId(body?.person) || !validGame(body?.game)) return fail(400, "bad request");
    const done = await db.prepare("DELETE FROM saves WHERE person = ? AND game = ?").bind(body.person, body.game).run();
    return reply(200, { deleted: done.meta.changes });
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
      db.prepare("DELETE FROM saves WHERE person = ?").bind(body.id),
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
    const parts = url.pathname.replace(/^\/people\/api/, "").split("/").filter(Boolean);
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
        if (text.length > MAX_SAVE + 2000) return fail(413, "too big");
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
      if (request.method === "GET" && parts[0] === "me") return reply(200, { id: who.id, name: who.name });
      if (request.method === "GET" && parts[0] === "save") return await load(env, who, url);
      if (request.method === "POST" && parts[0] === "save") return await save(env, who, body);
      return fail(404, "not found");
    } catch (e) {
      console.error(e);
      return fail(400, "bad request");
    }
  },
};
