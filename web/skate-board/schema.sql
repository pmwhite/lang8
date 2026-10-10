-- The skate leaderboards (see worker.js).
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
-- Each person's best run on each course, with the run itself (its replay,
-- as the game writes it) and the version of the game it was ridden on.
CREATE TABLE IF NOT EXISTS bests (
  person TEXT NOT NULL,
  course INTEGER NOT NULL,
  score INTEGER NOT NULL,
  version INTEGER NOT NULL,
  replay TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (person, course)
);
-- Each person's latest runs on each course, however they scored: a few
-- (see KEEP_RUNS in worker.js), without the runs themselves.
CREATE TABLE IF NOT EXISTS log (
  person TEXT NOT NULL,
  course INTEGER NOT NULL,
  score INTEGER NOT NULL,
  version INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS log_latest ON log (person, course, at);
-- (The tables of before there were people, when a board was shared by its
-- code, are no longer read or written: boards, players, scores, runs.)
