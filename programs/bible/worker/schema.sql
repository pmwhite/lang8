-- Smooth Bible's ESV proxy keeps only counts of its calls upstream: a row a
-- minute (m:2026-10-18T12:05), hour (h:2026-10-18T12) and day (d:2026-10-18),
-- UTC; those two days old are let go by each day's first call.
CREATE TABLE IF NOT EXISTS usage (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL);
