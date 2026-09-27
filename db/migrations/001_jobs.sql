-- SnapFlow download_jobs. Apply with: psql $DATABASE_URL -f db/migrations/001_jobs.sql
CREATE TABLE IF NOT EXISTS download_jobs (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL CHECK (status IN
                  ('PENDING','QUEUED','PROCESSING','UPLOADING','COMPLETED','FAILED','EXPIRED')),
  provider      TEXT NOT NULL DEFAULT 'tiktok',
  source_url    TEXT NOT NULL,
  title         TEXT,
  thumbnail     TEXT,
  duration      INTEGER,
  format        TEXT,
  resolution    TEXT,
  file_key      TEXT,
  file_size     BIGINT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  error_code    TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_download_jobs_status ON download_jobs (status);
CREATE INDEX IF NOT EXISTS idx_download_jobs_expires ON download_jobs (expires_at)
  WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_download_jobs_provider ON download_jobs (provider);
CREATE INDEX IF NOT EXISTS idx_download_jobs_created ON download_jobs (created_at DESC);
