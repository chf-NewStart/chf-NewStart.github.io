-- One row per day for the studio total, and one per visitor per day.
-- Visitors are a salted hash of their address, never the address itself.
CREATE TABLE IF NOT EXISTS paint_usage (
  bucket TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS paint_usage_day
  ON paint_usage (day);
