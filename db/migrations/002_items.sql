-- Phase 6: provider-agnostic media model. Apply after 001_jobs.sql:
--   psql $DATABASE_URL -f db/migrations/002_items.sql
ALTER TABLE download_jobs
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT
    CHECK (media_type IS NULL OR media_type IN ('VIDEO','IMAGE','AUDIO','CAROUSEL','STORY'));

CREATE TABLE IF NOT EXISTS download_items (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('VIDEO','IMAGE','AUDIO','CAROUSEL','STORY')),
  format      TEXT NOT NULL,
  container   TEXT NOT NULL,
  resolution  TEXT,
  width       INTEGER,
  height      INTEGER,
  file_key    TEXT NOT NULL,
  file_size   BIGINT,
  local_path  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_download_items_job ON download_items (job_id);
