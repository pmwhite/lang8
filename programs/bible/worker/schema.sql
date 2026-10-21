-- Smooth Bible's ESV proxy keeps only counts of its calls upstream, and the
-- addresses of the ESV's recordings. The counts: a row a
-- minute (m:2026-10-18T12:05), hour (h:2026-10-18T12) and day (d:2026-10-18),
-- UTC; those two days old are let go by each day's first call.
CREATE TABLE IF NOT EXISTS usage (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL);
-- The ESV API's recording of a chapter: its address on audio.esv.org (no
-- key in it, no text), as "JHN 3", and when it was asked for (ms); asked
-- again after 30 days.
CREATE TABLE IF NOT EXISTS audio_url (passage TEXT PRIMARY KEY, url TEXT NOT NULL, fetched INTEGER NOT NULL);
