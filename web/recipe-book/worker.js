// The recipe book's kitchens: a Cloudflare Worker at /recipes/api/ with a
// D1 database behind it (schema.sql).
//
// A kitchen is the text the book keeps of what there is to eat where (its
// places, what each has for each meal and day) and of what was eaten: the
// book's kitchen file, kept here whole. Its owner has a link, the book's
// page with the kitchen's secret after #me=; whoever opens it has that
// kitchen, on any device, so it is theirs alone to keep. Kitchens are made
// by the admin, who holds the admin secret (see admin.sh).
//
// Nothing saved is lost to a later save: the text from before a save is
// kept too, once an hour, and always when the save was made from an older
// text than the one here (another device's, say), up to KEEP_PAST of them.
//
//   GET  /kitchen                  {text, rev, updated, name}          (the owner)
//   POST /kitchen {text, base}     save it: {rev}; base is the rev it was made from
//   GET  /past                     the texts before: [{rev, at, size}], newest first
//   GET  /past?rev=N               one of them: {text, rev, at}
//   POST /restore {rev}            make one of them the kitchen again: {rev}
//   GET  /admin/all                every kitchen: [{id, name, rev, updated, size}]
//   POST /admin/kitchen {name}     make one: {id, name, secret}
//   POST /admin/relink {id}        a new secret for it: {secret} (the old link stops working)
//   POST /admin/rename {id, name}

const MAX_TEXT = 200000;
const MAX_KITCHENS = 20;
const KEEP_PAST = 500;
const PAST_EVERY = 60 * 60 * 1000;

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
const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
const goodName = (name) => typeof name === "string" && name.trim().length > 0 && name.length <= 60;

// The kitchen whose secret the request holds, or null.
const kitchenOf = async (env, request) => {
  const secret = bearer(request);
  if (secret.length < 16) return null;
  return await env.DB.prepare("SELECT * FROM kitchens WHERE secret_hash = ?").bind(await sha256(secret)).first();
};

const save = async (env, k, text, base) => {
  if (typeof text !== "string" || text.length > MAX_TEXT) return fail(413, "too big");
  const now = Date.now();
  const rev = k.rev + 1;
  const steps = [];
  // (What was here, kept: once an hour, and whenever this was made from
  // another text than it.)
  const last = await env.DB.prepare("SELECT MAX(at) AS at FROM past WHERE kitchen = ?").bind(k.id).first();
  if (k.rev > 0 && (base !== k.rev || !last?.at || now - last.at >= PAST_EVERY)) {
    steps.push(env.DB.prepare("INSERT OR REPLACE INTO past (kitchen, rev, at, text) VALUES (?, ?, ?, ?)").bind(k.id, k.rev, k.updated, k.text));
    steps.push(env.DB.prepare("DELETE FROM past WHERE kitchen = ? AND rev NOT IN (SELECT rev FROM past WHERE kitchen = ? ORDER BY rev DESC LIMIT ?)").bind(k.id, k.id, KEEP_PAST));
  }
  steps.push(env.DB.prepare("UPDATE kitchens SET text = ?, rev = ?, updated = ? WHERE id = ?").bind(text, rev, now, k.id));
  await env.DB.batch(steps);
  return reply(200, { rev, updated: now });
};

const admin = async (env, what, body) => {
  if (what === "kitchen") {
    if (!goodName(body?.name)) return fail(400, "a name, please");
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM kitchens").first();
    if (n >= MAX_KITCHENS) return fail(400, "too many kitchens");
    const id = random(8);
    const secret = random(24);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO kitchens (id, name, secret_hash, created, updated) VALUES (?, ?, ?, ?, ?)")
      .bind(id, body.name.trim(), await sha256(secret), now, now).run();
    return reply(200, { id, name: body.name.trim(), secret });
  }
  if (what === "relink") {
    const secret = random(24);
    const r = await env.DB.prepare("UPDATE kitchens SET secret_hash = ? WHERE id = ?").bind(await sha256(secret), body?.id ?? "").run();
    if (!r.meta.changes) return fail(404, "no such kitchen");
    return reply(200, { secret });
  }
  if (what === "rename") {
    if (!goodName(body?.name)) return fail(400, "a name, please");
    await env.DB.prepare("UPDATE kitchens SET name = ? WHERE id = ?").bind(body.name.trim(), body?.id ?? "").run();
    return reply(200, {});
  }
  return fail(404, "not found");
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/recipes\/api/, "").split("/").filter(Boolean);
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
        if (text.length > MAX_TEXT + 2000) return fail(413, "too big");
        body = JSON.parse(text);
      }
      if (parts[0] === "admin") {
        if (!env.ADMIN_SECRET || (await sha256(bearer(request))) !== (await sha256(env.ADMIN_SECRET))) return fail(401, "not allowed");
        if (request.method === "GET" && parts[1] === "all") {
          const { results } = await env.DB.prepare("SELECT id, name, rev, updated, LENGTH(text) AS size FROM kitchens ORDER BY created").all();
          return reply(200, results);
        }
        if (request.method === "POST") return await admin(env, parts[1], body);
        return fail(404, "not found");
      }
      const k = await kitchenOf(env, request);
      if (!k) return fail(401, "no such link");
      if (request.method === "GET" && parts[0] === "kitchen") return reply(200, { text: k.text, rev: k.rev, updated: k.updated, name: k.name });
      if (request.method === "POST" && parts[0] === "kitchen") return await save(env, k, body?.text, body?.base);
      if (request.method === "GET" && parts[0] === "past") {
        const rev = url.searchParams.get("rev");
        if (rev !== null) {
          const p = await env.DB.prepare("SELECT rev, at, text FROM past WHERE kitchen = ? AND rev = ?").bind(k.id, Number(rev)).first();
          return p ? reply(200, p) : fail(404, "no such text");
        }
        const { results } = await env.DB.prepare("SELECT rev, at, LENGTH(text) AS size FROM past WHERE kitchen = ? ORDER BY rev DESC").bind(k.id).all();
        return reply(200, results);
      }
      if (request.method === "POST" && parts[0] === "restore") {
        const p = await env.DB.prepare("SELECT text FROM past WHERE kitchen = ? AND rev = ?").bind(k.id, Number(body?.rev)).first();
        if (!p) return fail(404, "no such text");
        return await save(env, k, p.text, -1);
      }
      return fail(404, "not found");
    } catch (e) {
      console.error(e);
      return fail(400, "bad request");
    }
  },
};
