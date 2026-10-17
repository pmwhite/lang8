// Who is playing, for every game on this site (see ../people-api): the
// people who have played on this device, and which of them is playing now.
//
// A person's link is a game's page with their secret after the #, as
// `#me=<secret>`. Opening one adds them to this device's people and has
// them play, in every game here, until another is picked (as the skate
// game lets one be). What is kept of each is their secret, and their id
// and name as the people's Worker last said them.
//
// (?people= points a page on localhost at a people's Worker run there, to
// try one.)
const local = location.hostname === "localhost" && new URLSearchParams(location.search).get("people");
export const API = local || (location.hostname.endsWith("trailingwhite.space") ? "/people/api" : "https://trailingwhite.space/people/api");

const KNOWN = "people.known";
const ME = "people.me";
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const isSecret = (v) => typeof v === "string" && /^[a-z0-9]{24}$/.test(v);

// This device's people, the latest to play first, each {secret, id, name}
// (id and name null until the Worker has said them); and the secret of the
// one playing, or null.
let known = read(KNOWN, []).filter((p) => isSecret(p?.secret));
let mine = read(ME, null);
const keep = () => {
  write(KNOWN, known);
  write(ME, mine);
};
const add = (person) => {
  const was = known.find((p) => p.secret === person.secret);
  known = [{ id: null, name: null, ...was, ...person }, ...known.filter((p) => p.secret !== person.secret)];
};

// (The skate game kept the one person it had as skate.me, with who they
// were in skate.account: they are taken over, once. It is left as it was,
// for a copy of the old skate page a browser may have kept.)
const before = read("skate.me", null);
if (isSecret(before) && !read("people.adopted", false)) {
  const account = read("skate.account", null);
  add({ secret: before, id: account?.id ?? null, name: account?.name ?? null });
  mine ??= before;
  write("people.adopted", true);
}
if (!known.some((p) => p.secret === mine)) mine = known[0]?.secret ?? null;

// The secret this page was opened with (its link), or null: taken out of
// the address before anything else sees it there.
export const linked = location.hash.match(/^#me=([a-z0-9]{24})$/)?.[1] ?? null;
if (linked) {
  add({ secret: linked });
  mine = linked;
  history.replaceState(null, "", location.pathname + location.search);
}
keep();

// The one playing: {secret, id, name}, or null.
export const me = () => known.find((p) => p.secret === mine) ?? null;
// Everyone who has played here, the one playing first.
export const everyone = () => [...known].sort((a, b) => (b.secret === mine) - (a.secret === mine));
// Have someone else play (one of everyone()).
export const use = (secret) => {
  if (!known.some((p) => p.secret === secret)) return;
  add({ secret });
  mine = secret;
  keep();
};
// Take someone off this device (as when their link stops working).
export const forget = (secret) => {
  known = known.filter((p) => p.secret !== secret);
  if (mine === secret) mine = known[0]?.secret ?? null;
  keep();
};
// What a request of theirs carries, to whichever game's Worker.
export const authorization = (person = me()) => (person ? { authorization: `Bearer ${person.secret}` } : {});

// Ask the Worker who the one playing is: true if it says (their name and
// id are kept), false if they are nobody (no one plays, or their link works
// no longer: they are taken off this device), null if it could not be
// reached.
export const check = async () => {
  const person = me();
  if (!person) return false;
  try {
    const r = await fetch(`${API}/me`, { headers: authorization(person) });
    if (r.status === 401) {
      forget(person.secret);
      return false;
    }
    if (!r.ok) return null;
    const { id, name } = await r.json();
    const kept = known.find((p) => p.secret === person.secret);
    if (kept) Object.assign(kept, { id, name });
    keep();
    return true;
  } catch {
    return null;
  }
};

// Who the one playing is, as a game's Worker has said it: kept.
export const said = (id, name) => {
  const kept = me();
  if (!kept || (kept.id === id && kept.name === name)) return;
  Object.assign(kept, { id, name });
  keep();
};

// A game's save for the one playing (for a game with no Worker of its
// own): {data, at} (data null if there is none), or null if it could not
// be had.
export const loadSave = async (game, slot, person = me()) => {
  if (!person) return null;
  try {
    const r = await fetch(`${API}/save?game=${game}&slot=${encodeURIComponent(slot)}`, { headers: authorization(person), cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};
// Keep it: true if it was.
export const keepSave = async (game, slot, data, person = me()) => {
  if (!person) return false;
  try {
    const r = await fetch(`${API}/save`, {
      method: "POST",
      keepalive: data.length < 60000,
      headers: { "content-type": "application/json", ...authorization(person) },
      body: JSON.stringify({ game, slot, data }),
    });
    return r.ok;
  } catch {
    return false;
  }
};
