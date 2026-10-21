-- The recipe book's kitchens (see worker.js). Run with:
--   npx wrangler d1 execute recipe-book --remote --file schema.sql

-- A kitchen: whose it is (by the hash of their link's secret), its text
-- (the book's kitchen file: places, what each has, what was eaten), and
-- how many times it has been saved.
CREATE TABLE IF NOT EXISTS kitchens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);

-- Each kitchen's texts before: one an hour at most, the last KEEP_PAST
-- of them, so that nothing saved is lost to a later save.
CREATE TABLE IF NOT EXISTS past (
  kitchen TEXT NOT NULL,
  rev INTEGER NOT NULL,
  at INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (kitchen, rev)
);
