-- Phase 9: batch workspace. Apply after 004_admin.sql:
--   psql $DATABASE_URL -f db/migrations/005_batch.sql

-- Requested output format per job (server-validated allowlist only).
ALTER TABLE download_jobs
  ADD COLUMN IF NOT EXISTS format_kind TEXT NOT NULL DEFAULT 'auto'
    CHECK (format_kind IN ('auto','video','audio')),
  ADD COLUMN IF NOT EXISTS format_height INTEGER;

-- Batch container: children are normal download_jobs rows.
CREATE TABLE IF NOT EXISTS batch_jobs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  guest_key       TEXT,
  status          TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN
                    ('QUEUED','PROCESSING','PARTIALLY_COMPLETED','COMPLETED','FAILED','CANCELED','EXPIRED')),
  format_kind     TEXT NOT NULL DEFAULT 'auto',
  format_height   INTEGER,
  archive_key     TEXT,
  archive_size    BIGINT,
  archive_expires TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  CHECK ((user_id IS NULL) <> (guest_key IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_batch_user ON batch_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_batch_created ON batch_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS batch_items (
  batch_id  TEXT NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
  job_id    TEXT NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  PRIMARY KEY (batch_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON batch_items (batch_id);

-- Saved downloads: metadata bookmarks only, never permanent media.
CREATE TABLE IF NOT EXISTS saved_downloads (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      TEXT NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
