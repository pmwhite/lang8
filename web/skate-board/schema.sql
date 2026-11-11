-- The skate leaderboards (see worker.js).
-- (People and groups are kept by ../people-api, as every game's: a person
-- here is their id there.)
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
-- The best lines found down each place: the best runs a search of the
-- game's own rules has found there (see programs/skate/route.l8), posted by
-- the admin, one of each style: "wild" (anything the game allows) and
-- "human" (what a person could do). Each with its score, the version of
-- the game it was found on, the run itself (as the game writes a replay),
-- and when it was posted. They are no one's runs, and on no leaderboard.
CREATE TABLE IF NOT EXISTS place_lines (
  course INTEGER NOT NULL,
  style TEXT NOT NULL CHECK (style IN ('wild', 'human')),
  score INTEGER NOT NULL,
  version INTEGER NOT NULL,
  replay TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (course, style)
);
-- Runs shared (see share, in worker.js), for anyone with the id to watch:
-- the place, score, version and replay, as a best run's; the name of who
-- rode it; who shared it; and when.
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  course INTEGER NOT NULL,
  score INTEGER NOT NULL,
  version INTEGER NOT NULL,
  replay TEXT NOT NULL,
  name TEXT NOT NULL,
  by TEXT NOT NULL,
  at INTEGER NOT NULL
);
-- What a device has to say of how the game went on it: an error, or how
-- fast its frames came (data, as JSON: see report, in ../skate/skate.js).
-- With it, when; which visit to the page it is of; what the browser calls
-- itself; and whose link the device has, if any. Not its address. The old
-- ones are dropped (see KEEP_REPORTS in worker.js).
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  person TEXT,
  session TEXT NOT NULL,
  agent TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_session ON reports (session);
-- (Tables no longer read or written: those of before there were people,
-- when a board was shared by its code (boards, players, scores, runs); and
-- those of before people were every game's (people, grps, members), which
-- were copied to ../people-api's database.)
