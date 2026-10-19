-- Accounts, devices, codes and friends (see worker.js), added to a
-- database made by schema.sql before them. Run once, before the worker
-- that uses them is deployed:
--   npx wrangler d1 execute better-log --remote --file migrate-1.sql
-- It only adds: two columns to logs (every log there now counts as signed
-- in, since it was made), and three tables.
ALTER TABLE logs ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE logs ADD COLUMN joined INTEGER;
UPDATE logs SET joined = created;

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
