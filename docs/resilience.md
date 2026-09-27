# Resilience & Graceful Degradation (Phase 14)

System classification and failure behavior. Security boundaries are
never tradable for availability (see §5).

## 1. Critical (degraded ⇒ core flow must still protect data)

| System | Failure | Behavior |
|---|---|---|
| PostgreSQL | unreachable | Requests fail fast (5s connection timeout, 15s statement timeout); no unbounded hangs. Quota reservations fail closed (no free quota). Guards fail open only for *admission* probes, and enqueue failures refund quota — jobs stay QUEUED, never silently lost. |
| Redis/BullMQ | unreachable | Rate limits fail open (fail-closed would be a self-DoS); depth guard fails open; enqueue throws ⇒ 503 + refund. Local driver: restart kills in-flight (dev/tests only). |
| Workers | all down | Queue backs up to `MAX_QUEUE_SIZE`, then 503 `SERVICE_BUSY`. No data loss: rows stay QUEUED. |
| Object storage | degraded | Pipeline marks FAILED (retryable) with backoff; expiry sweep retries deletes. |

## 2. Important (degraded ⇒ core downloader keeps working)

Auth, billing, webhooks. Webhook delivery never blocks downloads
(async queue, 5 attempts, 4xx terminal, auto-disable at 10 consecutive
failures). Billing failures fail closed on entitlement reads. Growth
emails fail into the outbox retry loop.

## 3. Non-critical (degraded ⇒ zero impact on downloads)

Analytics (consent-gated no-op; worker side-effects best-effort
try/catch), marketing email, experiments (control fallback on any
error), growth features (kill-switches `referrals_enabled` /
`affiliates_enabled`), admin aggregates (stale cache served).

## 4. Stress scenarios and expected outcomes

- **Queue spike:** depth guard 503s beyond `MAX_QUEUE_SIZE`; batches
  now counted (`depth + items`), per-user cap
  (`MAX_ACTIVE_JOBS_PER_USER`, default 5) prevents one account from
  occupying all slots.
- **Worker saturation:** premium priority first; batches yield (+5
  priority points); archive work isolated on its own queue.
- **Provider timeout:** 90s `JOB_TIMEOUT` SIGKILL ⇒ retryable failure,
  3 BullMQ attempts with exponential backoff, then FAILED + terminal
  webhook event.
- **Slow database:** statement timeout + slow-query log (no params);
  per-request work is a handful of indexed queries.
- **Duplicate requests:** BullMQ jobId dedupe + idempotency keys +
  idempotent pipeline transitions.

## 5. Security boundaries preserved (non-negotiable)

Authorization checks, SSRF/DNS validation (kept in the request path
deliberately — parallelized for batches, never skipped), command
injection guards (`shell:false`), signed short-lived URLs, API-key
HMAC + hashing, webhook signing/verification, rate limits, audit logs.
Every Phase 14 change was reviewed against this list; the batch
validation parallelization changes concurrency only, not checks.
