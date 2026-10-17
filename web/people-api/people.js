// Who is who, for the Workers of the games (and this one): each binds the
// people's database as PEOPLE (see wrangler.toml here) and asks it, with
// these, whose secret a request carries and whom they see.

export const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");

// Whose secret the request carries: {id, name}, or null.
export const personOf = async (env, request) => {
  const secret = bearer(request);
  if (!/^[a-z0-9]{24}$/.test(secret)) return null;
  return await env.PEOPLE.prepare("SELECT id, name FROM people WHERE secret = ?").bind(secret).first();
};

// Those a person sees: themselves, and everyone they share a group with,
// each {id, name}.
export const seenBy = async (env, id) => {
  const rows = await env.PEOPLE.prepare(
    "SELECT id, name FROM people WHERE id = ?1 OR id IN (SELECT m2.person FROM members m1 JOIN members m2 ON m1.grp = m2.grp WHERE m1.person = ?1)"
  )
    .bind(id)
    .all();
  return rows.results;
};
