-- Better's logs (see worker.js). Run with:
--   npx wrangler d1 execute better-log --remote --file schema.sql
-- (A database made before accounts: migrate-1.sql adds them.)

-- A log, which is a person's account: whose it is (by the hash of their
-- link's secret), its text (Better's log file: each activity's times,
-- distances, speeds and climbing, and nothing of where), how many times it
-- has been saved, whether they are an admin, and when they first signed in
-- (null: invited, not yet).
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  admin INTEGER NOT NULL DEFAULT 0,
  joined INTEGER
);

-- Each log's texts before: one an hour at most, the last KEEP_PAST
-- of them, so that nothing saved is lost to a later save.
CREATE TABLE IF NOT EXISTS past (
  log TEXT NOT NULL,
  rev INTEGER NOT NULL,
  at INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (log, rev)
);

-- A device signed in: its token's hash, and whose account it is.
CREATE TABLE IF NOT EXISTS devices (
  token_hash TEXT PRIMARY KEY,
  log TEXT NOT NULL,
  made INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_log ON devices (log);

-- A code, by its hash: signin (signs a device in as log) or friend
-- (befriends log, who sent it); good until, used once (when), and who made
-- it (an admin's id, or 'admin' for the admin secret; null: log itself),
-- with whether an invite befriends them too.
CREATE TABLE IF NOT EXISTS codes (
  code_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  log TEXT NOT NULL,
  made INTEGER NOT NULL,
  until INTEGER NOT NULL,
  used INTEGER,
  friend INTEGER NOT NULL DEFAULT 0,
  by TEXT
);
CREATE INDEX IF NOT EXISTS codes_log ON codes (log, kind);

-- Friends: a row each way, since when.
CREATE TABLE IF NOT EXISTS friends (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  since INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
