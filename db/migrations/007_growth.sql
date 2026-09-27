-- Phase 12: growth engine. Apply after 006_api.sql:
--   psql $DATABASE_URL -f db/migrations/007_growth.sql

-- Referral codes: opaque, revocable, never sequential user IDs.
CREATE TABLE IF NOT EXISTS referral_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes (user_id);

-- Referral relationships with a full status lifecycle.
CREATE TABLE IF NOT EXISTS referrals (
  id                TEXT PRIMARY KEY,
  referrer_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id  TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code_id  TEXT NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN
                      ('PENDING','QUALIFIED','REWARDED','INVALID','REVERSED','REVIEW')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_user_id, status);

-- Affiliates: separate from referrals by design.
CREATE TABLE IF NOT EXISTS affiliates (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN
                    ('PENDING','ACTIVE','SUSPENDED','REJECTED')),
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commission ledger: append-only financial records, never deleted.
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id              TEXT PRIMARY KEY,
  affiliate_id    TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  subscription_id TEXT,
  amount_cents    INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN
                    ('PENDING','APPROVED','PAID','REVERSED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON affiliate_commissions (affiliate_id, status);

-- Payout records (manual process; no banking integration).
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id            TEXT PRIMARY KEY,
  affiliate_id  TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  status        TEXT NOT NULL DEFAULT 'PAYOUT_PENDING' CHECK (status IN
                  ('PAYOUT_PENDING','PAYOUT_PROCESSING','PAYOUT_COMPLETED','PAYOUT_FAILED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In-app notifications. Payloads carry ids/statuses only, never secrets.
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

-- Per-user notification preferences. Marketing is opt-in, explicit.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  marketing_email_opt_in  BOOLEAN NOT NULL DEFAULT FALSE,
  download_notify         BOOLEAN NOT NULL DEFAULT TRUE,
  referral_notify         BOOLEAN NOT NULL DEFAULT TRUE,
  affiliate_notify        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactional email log (operational metadata only).
CREATE TABLE IF NOT EXISTS email_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  type        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('QUEUED','SENT','FAILED','SKIPPED')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs (user_id, created_at DESC);

-- Lightweight campaigns (controlled templates only, see docs/growth.md).
CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('win_back','inactive_nudge','announcement')),
  status      TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','DONE')),
  audience    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  sent_count  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
