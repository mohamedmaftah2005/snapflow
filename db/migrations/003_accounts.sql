-- Phase 7: accounts, plans, billing. Apply after 002_items.sql:
--   psql $DATABASE_URL -f db/migrations/003_accounts.sql
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  email_lower       TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  name              TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY, -- sha256 hex of the opaque token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Single-use auth tokens (email verification, password reset): only hashes stored.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          TEXT PRIMARY KEY, -- sha256 hex of the opaque token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens (user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                 TEXT NOT NULL CHECK (plan_id IN ('free','premium')),
  provider                TEXT NOT NULL, -- 'stripe' | 'test'
  external_customer_id    TEXT,
  external_subscription_id TEXT,
  status                  TEXT NOT NULL CHECK (status IN
                            ('ACTIVE','TRIALING','PAST_DUE','CANCELED','EXPIRED')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_external ON subscriptions (external_subscription_id);

-- Idempotent webhook processing ledger.
CREATE TABLE IF NOT EXISTS webhook_events (
  id            TEXT PRIMARY KEY, -- provider event id
  provider      TEXT NOT NULL,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('RECEIVED','PROCESSED','FAILED')),
  error         TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily usage buckets. Exactly one of user_id / guest_key is set.
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  guest_key   TEXT,
  day         DATE NOT NULL,
  downloads   INTEGER NOT NULL DEFAULT 0,
  bytes       BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (guest_key IS NULL)),
  UNIQUE (user_id, day),
  UNIQUE (guest_key, day)
);
CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage_daily (user_id, day);

-- Job ownership + per-job effective cap (premium allows larger files).
ALTER TABLE download_jobs
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_file_size BIGINT;
CREATE INDEX IF NOT EXISTS idx_download_jobs_user ON download_jobs (user_id);
