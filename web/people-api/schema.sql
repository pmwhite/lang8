-- The people every game shares (see worker.js).
-- A person, made by the admin: their name, and the secret in their link
-- (kept as it is, so that the admin's page can share the link again).
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
-- A group, made by the admin, and who is in it.
CREATE TABLE IF NOT EXISTS grps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  grp TEXT NOT NULL,
  person TEXT NOT NULL,
  PRIMARY KEY (grp, person)
);
CREATE INDEX IF NOT EXISTS members_person ON members (person);
-- What a game keeps of a person, for a game with no server of its own (the
-- block game's levels solved, in each world): a slot each, by its name,
-- as the game writes it, and when it last did.
CREATE TABLE IF NOT EXISTS saves (
  person TEXT NOT NULL,
  game TEXT NOT NULL,
  slot TEXT NOT NULL,
  data TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (person, game, slot)
);
