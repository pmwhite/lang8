-- The skate leaderboards (see worker.js).
-- A board is a list of scores shared by whoever has its code.
CREATE TABLE IF NOT EXISTS boards (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created INTEGER NOT NULL
);
-- A name on a board belongs to the device that first posted under it: the
-- hash of that device's token.
CREATE TABLE IF NOT EXISTS players (
  board TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (board, name)
);
-- Each player's best run on each course, with the run itself (its replay,
-- as the game writes it) and the version of the game it was ridden on.
CREATE TABLE IF NOT EXISTS scores (
  board TEXT NOT NULL,
  course INTEGER NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  version INTEGER NOT NULL,
  replay TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (board, course, name)
);
