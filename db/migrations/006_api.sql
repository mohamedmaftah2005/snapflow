-- Phase 10: public developer API. Apply after 005_batch.sql:
--   psql $DATABASE_URL -f db/migrations/006_api.sql

-- API keys: only prefix + hash stored, never the raw key.
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  scopes      TEXT[] NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (prefix);

-- Idempotency ledger for v1 creation endpoints (24h TTL, lazily purged).
CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  key           TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id    TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  request_hash  TEXT NOT NULL,
  response      JSONB NOT NULL,
  status_code   INTEGER NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON api_idempotency_keys (expires_at);

-- Developer webhook endpoints. Secrets stored encrypted (see WEBHOOK_SECRET_KEY).
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  secret_encrypted  TEXT NOT NULL,
  events            TEXT[] NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_delivered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user ON webhook_endpoints (user_id);

-- Delivery log (bounded per endpoint by cleanup).
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            TEXT PRIMARY KEY,
  endpoint_id   TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('DELIVERED','FAILED','DISABLED')),
  http_status   INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 1,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id, created_at DESC);
