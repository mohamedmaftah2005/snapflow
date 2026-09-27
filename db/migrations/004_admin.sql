-- Phase 8: admin control plane. Apply after 003_accounts.sql:
--   psql $DATABASE_URL -f db/migrations/004_admin.sql

-- Roles: least privilege, minimum necessary set.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER'
    CHECK (role IN ('USER','SUPPORT','OPERATOR','ADMIN'));

-- Centralized feature flags (DB wins over env defaults; cached in-process).
CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit log: no UPDATE/DELETE API exists by design.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role    TEXT NOT NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  reason        TEXT,
  metadata      JSONB,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON admin_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs (created_at DESC);

-- CANCELED terminal state for operator-cancelled jobs.
ALTER TABLE download_jobs DROP CONSTRAINT IF EXISTS download_jobs_status_check;
ALTER TABLE download_jobs ADD CONSTRAINT download_jobs_status_check
  CHECK (status IN ('PENDING','QUEUED','PROCESSING','UPLOADING','COMPLETED','FAILED','EXPIRED','CANCELED'));
