-- Better's logs (see worker.js). Run with:
--   npx wrangler d1 execute better-log --remote --file schema.sql

-- A log: whose it is (by the hash of their link's secret), its text
-- (Better's log file: each activity's times, distances, speeds and
-- climbing, and nothing of where), and how many times it has been saved.
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
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

