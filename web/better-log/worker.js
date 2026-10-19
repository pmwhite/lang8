// Better's logs: a Cloudflare Worker at /better/api/ (and /tempo/api/, its
// name before, which iPhones not yet updated still ask) with a D1 database
// behind it (schema.sql).
//
// A log is the text Better keeps of the activities recorded: when each
// was, how long, how far, how fast through it, and how much it climbed
// and descended; never where (Better is not told). It is Better's log file,
// kept here whole. A log is a person's account: they sign a device in with
// a short code (from the admin, or from Better on another of their
// devices), and the device is given a token of its own; whoever holds the
// token has that log, so it is theirs alone to keep. The first logs were
// made with a link instead, Better's page with the log's secret after
// #me=, which is still taken as a token. Logs are made by the admin: who
// holds the admin secret (see admin.sh), or a person marked as admin.
//
// A save made from an older text than the one here (another device saved
// since) is refused with the text here, for the page to put the two
// together and save again. Nothing saved is lost to a later save anyway:
// the text from before a save is kept too, once an hour, up to KEEP_PAST
// of them.
//
// Friends see each other's last four weeks: of each activity, only its act
// and up lines (when, the sport, how long and far, its name, the climbing),
// cut out of the log here, so nothing else of it leaves.
//
//   GET  /log                      {text, rev, updated, name, id, admin}   (the owner)
//   POST /log {text, base}         save it: {rev}; base is the rev it was made
//                                  from (409 {text, rev} if that is not this one)
//   GET  /past                     the texts before: [{rev, at, size}], newest first
//   GET  /past?rev=N               one of them: {text, rev, at}
//   POST /restore {rev}            make one of them the log again: {rev}
//   POST /code/look {code}         what a code is: {kind, id, name} (signin: whose;
//                                  friend: who sent it); uses nothing
//   POST /code/use {code}          signin: {kind, token, id, name, admin} (a device
//                                  signed in); friend (signed in): {kind, id, name}
//   POST /device/code              a sign-in code for another of the owner's devices
//   POST /friends/code             a friend code: {code, until}
//   GET  /friends                  friends and their last four weeks (text, below)
//   POST /friends/remove {id}      friends no more, both ways
//   POST /signout                  this device's token forgotten
//   GET  /admin/all                every log: [{id, name, rev, updated, size, admin,
//                                  joined, invite_until, acts}]
//   POST /admin/invite {name, friend}  a log for someone, and a code for them to
//                                  sign in with: {id, name, code, until}
//   POST /admin/code {id}          a new code for them: {code, until, name, joined}
//   POST /admin/flag {id, admin}   mark them admin, or not (the admin secret only)
//   POST /admin/log {name}         make one with a link: {id, name, secret}
//   POST /admin/relink {id}        a new secret for it: {secret} (the old link and
//                                  every device signed in stop working)
//   POST /admin/rename {id, name}
//
// Codes are 8 letters and digits (shown K7QM-3XPA), kept only as hashes,
// for one use each, and good for a while: an invite 14 days, a new code
// from the admin 7 (14 for someone not yet signed in), one for another
// device 10 minutes, a friend code 7 days. Used and run out, they are kept
// 30 days more, to say so rather than that a code is wrong.
//
// The friends feed, a line to a thing:
//   friend ID SINCE NAME           each friend, by name (SINCE ms)
//   act START TZ SPORT ELAPSED MOVING DIST MAX NAME   their activities since
//   up GAIN LOSS                   four weeks ago, newest first, at most 40

const MAX_TEXT = 4000000;
const MAX_LOGS = 100;
const KEEP_PAST = 500;
const PAST_EVERY = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const KEEP_CODES = 30 * DAY;
const INVITE_FOR = 14 * DAY;
const NEW_CODE_FOR = 7 * DAY;
const DEVICE_CODE_FOR = 10 * MINUTE;
const FRIEND_CODE_FOR = 7 * DAY;
// (At most this many codes live at once: for another device, and to send
// to friends; a new one cancels the oldest.)
const DEVICE_CODES = 3;
const FRIEND_CODES = 10;
const FEED_FOR = 28 * DAY;
const FEED_MOST = 40;

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
// Random letters and digits (none that look alike): 24 make a secret or a
// token, 8 an id or a code.
const LETTERS = "abcdefghijkmnpqrstuvwxyz23456789";
const random = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => LETTERS[b % LETTERS.length]).join("");
const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
const goodName = (name) => typeof name === "string" && name.trim().length > 0 && name.length <= 60;
// (A name on one line.)
const oneLine = (name) => String(name).replace(/\s+/g, " ").trim();

// A code as it was typed or pasted: big or small letters, dashes and
// spaces, or a whole link (the 8 after c=); anything else dropped.
const codeOf = (typed) => {
  if (typeof typed !== "string") return "";
  const link = typed.match(/c=([^&\s]*)/i);
  return [...(link ? link[1] : typed).toLowerCase()].filter((c) => LETTERS.includes(c)).join("").slice(0, 9);
};

// The log whose secret or device's token the request holds, or null (with
// the device's token's hash as device, if it is one).
const logOf = async (env, request) => {
  const secret = bearer(request);
  if (secret.length < 16) return null;
  const hash = await sha256(secret);
  const k = await env.DB.prepare("SELECT * FROM logs WHERE secret_hash = ?").bind(hash).first();
  if (k) return k;
  const d = await env.DB.prepare("SELECT logs.* FROM devices JOIN logs ON logs.id = devices.log WHERE devices.token_hash = ?").bind(hash).first();
  return d ? { ...d, device: hash } : null;
};

const save = async (env, k, text, base) => {
  if (typeof text !== "string" || text.length > MAX_TEXT) return fail(413, "too big");
  // (Saved from elsewhere since: what is here, to be put together with.)
  if (base !== -1 && base !== k.rev) return reply(409, { text: k.text, rev: k.rev });
  const now = Date.now();
  const rev = k.rev + 1;
  const steps = [];
  // (What was here, kept: once an hour, and whenever this was made from
  // another text than it.)
  const last = await env.DB.prepare("SELECT MAX(at) AS at FROM past WHERE log = ?").bind(k.id).first();
  if (k.rev > 0 && (base === -1 || !last?.at || now - last.at >= PAST_EVERY)) {
    steps.push(env.DB.prepare("INSERT OR REPLACE INTO past (log, rev, at, text) VALUES (?, ?, ?, ?)").bind(k.id, k.rev, k.updated, k.text));
    steps.push(env.DB.prepare("DELETE FROM past WHERE log = ? AND rev NOT IN (SELECT rev FROM past WHERE log = ? ORDER BY rev DESC LIMIT ?)").bind(k.id, k.id, KEEP_PAST));
  }
  steps.push(env.DB.prepare("UPDATE logs SET text = ?, rev = ?, updated = ? WHERE id = ?").bind(text, rev, now, k.id));
  await env.DB.batch(steps);
  return reply(200, { rev, updated: now });
};

// ---- codes ----
// A new code: kind signin (signs a device in as log) or friend (befriends
// log), good for `good` ms; made by an admin (by, and whether it befriends
// them too), or by log itself. Those of the same kind past their cap are
// cancelled (live: their until made now), and long-dead ones forgotten.
const newCode = async (env, kind, log, good, { by = null, friend = 0, cap = 0 } = {}) => {
  const now = Date.now();
  const code = random(8);
  const steps = [env.DB.prepare("DELETE FROM codes WHERE until < ?").bind(now - KEEP_CODES)];
  const live = "used IS NULL AND until > ? AND kind = ? AND log = ?";
  if (by !== null) {
    // (Someone has one live code from the admin: a new one cancels it.)
    steps.push(env.DB.prepare(`UPDATE codes SET until = ? WHERE ${live} AND by IS NOT NULL`).bind(now, now, kind, log));
  } else if (cap > 0) {
    steps.push(env.DB.prepare(`UPDATE codes SET until = ? WHERE code_hash IN (SELECT code_hash FROM codes WHERE ${live} AND by IS NULL ORDER BY made DESC LIMIT -1 OFFSET ?)`)
      .bind(now, now, kind, log, cap - 1));
  }
  steps.push(env.DB.prepare("INSERT INTO codes (code_hash, kind, log, made, until, used, friend, by) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)")
    .bind(await sha256(code), kind, log, now, now + good, friend ? 1 : 0, by));
  await env.DB.batch(steps);
  return { code, until: now + good };
};

// The code in the request's body, with whose it is (name), or the reply
// that says what is wrong with it.
const codeIn = async (env, body) => {
  const code = codeOf(body?.code);
  if (code.length !== 8) return { no: fail(404, "wrong") };
  const c = await env.DB.prepare("SELECT codes.*, logs.name AS name FROM codes JOIN logs ON logs.id = codes.log WHERE code_hash = ?")
    .bind(await sha256(code)).first();
  if (!c) return { no: fail(404, "wrong") };
  if (c.used !== null) return { no: fail(410, "used") };
  if (c.until <= Date.now()) return { no: fail(410, "expired") };
  return { c };
};

// The code marked used, if it still was not (two using it at once: only
// one has it).
const claim = async (env, c, now) => {
  const r = await env.DB.prepare("UPDATE codes SET used = ? WHERE code_hash = ? AND used IS NULL AND until > ?")
    .bind(now, c.code_hash, now).run();
  return r.meta.changes === 1;
};

// Friends, both ways.
const befriend = (env, a, b, now) => [
  env.DB.prepare("INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)").bind(a, b, now),
  env.DB.prepare("INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)").bind(b, a, now),
];

const useCode = async (env, request, body) => {
  const { c, no } = await codeIn(env, body);
  if (no) return no;
  const k = await logOf(env, request);
  const now = Date.now();
  if (c.kind === "signin") {
    if (k) return c.log === k.id ? fail(409, "signed-in") : reply(409, { error: "other", name: c.name });
    if (!(await claim(env, c, now))) return fail(410, "used");
    const token = random(24);
    const steps = [
      env.DB.prepare("INSERT INTO devices (token_hash, log, made) VALUES (?, ?, ?)").bind(await sha256(token), c.log, now),
      env.DB.prepare("UPDATE logs SET joined = ? WHERE id = ? AND joined IS NULL").bind(now, c.log),
    ];
    // (An invite that makes them friends with the admin who sent it.)
    if (c.friend && c.by && c.by !== c.log && (await env.DB.prepare("SELECT 1 FROM logs WHERE id = ?").bind(c.by).first())) {
      steps.push(...befriend(env, c.log, c.by, now));
    }
    await env.DB.batch(steps);
    const me = await env.DB.prepare("SELECT id, name, admin FROM logs WHERE id = ?").bind(c.log).first();
    return reply(200, { kind: "signin", token, id: me.id, name: me.name, admin: me.admin });
  }
  if (!k) return fail(401, "sign-in-first");
  if (c.log === k.id) return fail(409, "own");
  if (await env.DB.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ?").bind(k.id, c.log).first()) {
    return reply(409, { error: "already", name: c.name });
  }
  if (!(await claim(env, c, now))) return fail(410, "used");
  await env.DB.batch(befriend(env, k.id, c.log, now));
  return reply(200, { kind: "friend", id: c.log, name: c.name });
};

// ---- friends ----
// A friend's last four weeks, out of their log's text: each activity's act
// and up lines only, newest first, less those deleted.
const recent = (text, now) => {
  const acts = new Map();
  const gone = new Set();
  let at = null;
  for (const line of text.split("\n")) {
    const w = line.split(" ");
    if (w[0] === "act") {
      at = w[1];
      acts.set(at, { start: Number(w[1]), lines: [line] });
    } else if (w[0] === "up" && at !== null) acts.get(at).lines.push(line);
    else if (w[0] === "gone") gone.add(w[1]);
  }
  return [...acts.entries()]
    .filter(([k, a]) => !gone.has(k) && a.start * 1000 >= now - FEED_FOR && a.start * 1000 <= now + DAY)
    .sort((x, y) => y[1].start - x[1].start)
    .slice(0, FEED_MOST)
    .flatMap(([, a]) => a.lines);
};

const feed = async (env, k) => {
  const { results } = await env.DB.prepare("SELECT logs.id, logs.name, logs.text, friends.since FROM friends JOIN logs ON logs.id = friends.b WHERE friends.a = ? ORDER BY logs.name COLLATE NOCASE, logs.id")
    .bind(k.id).all();
  const now = Date.now();
  const lines = [];
  for (const f of results) {
    lines.push(`friend ${f.id} ${f.since} ${oneLine(f.name)}`);
    lines.push(...recent(f.text, now));
  }
  return new Response(lines.join("\n") + (lines.length ? "\n" : ""), { status: 200, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
};

// ---- the admin ----
// me: the admin's own log (null for the admin secret).
const admin = async (env, what, body, me) => {
  const by = me ? me.id : "admin";
  if (what === "invite") {
    if (!goodName(body?.name)) return fail(400, "a name, please");
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM logs").first();
    if (n >= MAX_LOGS) return fail(400, "too many logs");
    const id = random(8);
    const name = oneLine(body.name);
    const now = Date.now();
    // (No link: its secret is thrown away. They sign in with the code.)
    await env.DB.prepare("INSERT INTO logs (id, name, secret_hash, created, updated, joined) VALUES (?, ?, ?, ?, ?, NULL)")
      .bind(id, name, await sha256(random(24)), now, now).run();
    const { code, until } = await newCode(env, "signin", id, INVITE_FOR, { by, friend: body.friend && me ? 1 : 0 });
    return reply(200, { id, name, code, until });
  }
  if (what === "code") {
    const k = await env.DB.prepare("SELECT id, name, joined FROM logs WHERE id = ?").bind(body?.id ?? "").first();
    if (!k) return fail(404, "no such log");
    // (Not signed in yet: the new code befriends them as the invite would
    // have.)
    let friend = 0;
    if (k.joined === null) {
      friend = (await env.DB.prepare("SELECT MAX(friend) AS f FROM codes WHERE log = ? AND kind = 'signin' AND by = ?").bind(k.id, by).first())?.f ?? 0;
    }
    const { code, until } = await newCode(env, "signin", k.id, k.joined === null ? INVITE_FOR : NEW_CODE_FOR, { by, friend });
    return reply(200, { code, until, name: k.name, joined: k.joined === null ? 0 : 1 });
  }
  if (what === "flag") {
    if (me) return fail(403, "not allowed");
    const r = await env.DB.prepare("UPDATE logs SET admin = ? WHERE id = ?").bind(body?.admin ? 1 : 0, body?.id ?? "").run();
    if (!r.meta.changes) return fail(404, "no such log");
    return reply(200, {});
  }
  if (what === "log") {
    if (!goodName(body?.name)) return fail(400, "a name, please");
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM logs").first();
    if (n >= MAX_LOGS) return fail(400, "too many logs");
    const id = random(8);
    const secret = random(24);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO logs (id, name, secret_hash, created, updated, joined) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, oneLine(body.name), await sha256(secret), now, now, now).run();
    return reply(200, { id, name: oneLine(body.name), secret });
  }
  if (what === "relink") {
    const secret = random(24);
    const id = body?.id ?? "";
    const r = await env.DB.prepare("UPDATE logs SET secret_hash = ? WHERE id = ?").bind(await sha256(secret), id).run();
    if (!r.meta.changes) return fail(404, "no such log");
    await env.DB.prepare("DELETE FROM devices WHERE log = ?").bind(id).run();
    return reply(200, { secret });
  }
  if (what === "rename") {
    if (!goodName(body?.name)) return fail(400, "a name, please");
    await env.DB.prepare("UPDATE logs SET name = ? WHERE id = ?").bind(oneLine(body.name), body?.id ?? "").run();
    return reply(200, {});
  }
  return fail(404, "not found");
};

const everyone = async (env) => {
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT id, name, rev, updated, LENGTH(text) AS size, admin, joined,
      CASE WHEN joined IS NULL THEN (SELECT MAX(until) FROM codes WHERE codes.log = logs.id AND kind = 'signin' AND used IS NULL AND until > ?) END AS invite_until,
      (LENGTH(text) - LENGTH(REPLACE(text, char(10) || 'act ', ''))) / 5 + (CASE WHEN text LIKE 'act %' THEN 1 ELSE 0 END) AS acts
    FROM logs ORDER BY created`).bind(now).all();
  return reply(200, results);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/(better|tempo)\/api/, "").split("/").filter(Boolean);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    // Not too often from one address (which is not kept); codes, less often
    // still, as they could be guessed at.
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    if (env.LIMIT) {
      const { success } = await env.LIMIT.limit({ key: ip });
      if (!success) return fail(429, "slow down");
    }
    if (parts[0] === "code" && env.CODE_LIMIT) {
      const { success } = await env.CODE_LIMIT.limit({ key: ip });
      if (!success) return fail(429, "slow down");
    }
    try {
      let body = null;
      if (request.method === "POST") {
        const text = await request.text();
        if (text.length > MAX_TEXT + 2000) return fail(413, "too big");
        body = text ? JSON.parse(text) : {};
      }
      if (parts[0] === "admin") {
        // (The admin secret, or a person marked admin.)
        let me = null;
        if (!env.ADMIN_SECRET || (await sha256(bearer(request))) !== (await sha256(env.ADMIN_SECRET))) {
          me = await logOf(env, request);
          if (!me) return fail(401, "not allowed");
          if (!me.admin) return fail(403, "not allowed");
        }
        if (request.method === "GET" && parts[1] === "all") return await everyone(env);
        if (request.method === "POST") return await admin(env, parts[1], body, me);
        return fail(404, "not found");
      }
      if (request.method === "POST" && parts[0] === "code" && parts[1] === "look") {
        const { c, no } = await codeIn(env, body);
        return no ?? reply(200, { kind: c.kind, id: c.log, name: c.name });
      }
      if (request.method === "POST" && parts[0] === "code" && parts[1] === "use") return await useCode(env, request, body);
      const k = await logOf(env, request);
      if (!k) return fail(401, "no such link");
      if (request.method === "GET" && parts[0] === "log") {
        return reply(200, { text: k.text, rev: k.rev, updated: k.updated, name: k.name, id: k.id, admin: k.admin });
      }
      if (request.method === "POST" && parts[0] === "log") return await save(env, k, body?.text, body?.base);
      if (request.method === "GET" && parts[0] === "past") {
        const rev = url.searchParams.get("rev");
        if (rev !== null) {
          const p = await env.DB.prepare("SELECT rev, at, text FROM past WHERE log = ? AND rev = ?").bind(k.id, Number(rev)).first();
          return p ? reply(200, p) : fail(404, "no such text");
        }
        const { results } = await env.DB.prepare("SELECT rev, at, LENGTH(text) AS size FROM past WHERE log = ? ORDER BY rev DESC").bind(k.id).all();
        return reply(200, results);
      }
      if (request.method === "POST" && parts[0] === "restore") {
        const p = await env.DB.prepare("SELECT text FROM past WHERE log = ? AND rev = ?").bind(k.id, Number(body?.rev)).first();
        if (!p) return fail(404, "no such text");
        return await save(env, k, p.text, -1);
      }
      if (request.method === "POST" && parts[0] === "device" && parts[1] === "code") {
        return reply(200, await newCode(env, "signin", k.id, DEVICE_CODE_FOR, { cap: DEVICE_CODES }));
      }
      if (request.method === "POST" && parts[0] === "friends" && parts[1] === "code") {
        return reply(200, await newCode(env, "friend", k.id, FRIEND_CODE_FOR, { cap: FRIEND_CODES }));
      }
      if (request.method === "GET" && parts[0] === "friends" && !parts[1]) return await feed(env, k);
      if (request.method === "POST" && parts[0] === "friends" && parts[1] === "remove") {
        const id = String(body?.id ?? "");
        await env.DB.prepare("DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)").bind(k.id, id, id, k.id).run();
        return reply(200, {});
      }
      if (request.method === "POST" && parts[0] === "signout") {
        if (k.device) await env.DB.prepare("DELETE FROM devices WHERE token_hash = ?").bind(k.device).run();
        return reply(200, {});
      }
      return fail(404, "not found");
    } catch (e) {
      console.error(e);
      return fail(400, "bad request");
    }
  },
};
