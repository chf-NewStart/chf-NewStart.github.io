CREATE TABLE IF NOT EXISTS review_passes (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  claim_before INTEGER NOT NULL,
  active_until INTEGER,
  job_id TEXT,
  calls_used INTEGER NOT NULL DEFAULT 0,
  max_calls INTEGER NOT NULL,
  reserved_tokens INTEGER NOT NULL DEFAULT 0,
  token_budget INTEGER NOT NULL,
  completed_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS review_passes_expiry
  ON review_passes (claim_before, active_until, revoked);
