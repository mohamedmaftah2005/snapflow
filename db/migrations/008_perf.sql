-- Phase 14: performance indexes. Apply after 007_growth.sql:
--   psql $DATABASE_URL -f db/migrations/008_perf.sql
--
-- Every index below serves a query observed in the codebase (see
-- docs/performance-audit.md). No speculative indexes.

-- listByUser / listHistory: WHERE user_id ORDER BY created_at DESC LIMIT
CREATE INDEX IF NOT EXISTS idx_download_jobs_user_created
  ON download_jobs (user_id, created_at DESC);

-- Per-user in-flight cap: WHERE user_id AND status IN (active set)
CREATE INDEX IF NOT EXISTS idx_download_jobs_user_status
  ON download_jobs (user_id, status);

-- listBatchesByUser: WHERE user_id ORDER BY created_at DESC LIMIT
CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_created
  ON batch_jobs (user_id, created_at DESC);

-- getActiveSubscription: WHERE user_id AND status IN (...) ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_created
  ON subscriptions (user_id, status, created_at DESC);

-- getBatchesForJob (webhook batch fan-out): WHERE job_id
CREATE INDEX IF NOT EXISTS idx_batch_items_job
  ON batch_items (job_id);

-- getBatchJobIds ordering: WHERE batch_id ORDER BY position
CREATE INDEX IF NOT EXISTS idx_batch_items_batch_position
  ON batch_items (batch_id, position);

-- getItems ordering: WHERE job_id ORDER BY id
CREATE INDEX IF NOT EXISTS idx_download_items_job_id
  ON download_items (job_id, id);

-- getCommissionBySubscription: WHERE subscription_id (was a seq scan)
CREATE INDEX IF NOT EXISTS idx_commissions_subscription
  ON affiliate_commissions (subscription_id);

-- listPayouts: WHERE affiliate_id ORDER BY created_at DESC (was unindexed)
CREATE INDEX IF NOT EXISTS idx_payouts_affiliate
  ON affiliate_payouts (affiliate_id, created_at DESC);

-- listReferralsByReferrer: WHERE referrer_user_id ORDER BY created_at DESC
-- (existing idx_referrals_referrer covers (referrer, status) filtering; kept)
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created
  ON referrals (referrer_user_id, created_at DESC);

-- listWebhookEvents: ORDER BY received_at DESC LIMIT/OFFSET
CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events (received_at DESC);

-- countUnread: WHERE user_id AND read_at IS NULL
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id) WHERE read_at IS NULL;

-- listAudit filter+sort: action/actor + ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_action_created
  ON admin_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created
  ON admin_audit_logs (actor_user_id, created_at DESC);

-- listApiKeys / listWebhookEndpoints: WHERE user_id ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_api_keys_user_created
  ON api_keys (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user_created
  ON webhook_endpoints (user_id, created_at DESC);
