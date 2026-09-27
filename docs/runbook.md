# SnapFlow incident runbook

## Quick triage
1. `GET /api/health` — which of queue/db/storage is degraded?
2. `GET /api/metrics` (bearer `METRICS_TOKEN`) — `snapflow_jobs_failed_total`,
   `snapflow_queue_rejected_total`, `snapflow_cleanup_failures_total`, processing durations.
3. Worker logs: look for `worker_heartbeat` (alive?), `job_failed` codes, `cleanup_error`.

## Scenarios

### Worker stops / no heartbeat for 3+ minutes
- Restart the worker container. On boot it runs `cleanupStaleTempDirs`,
  `purgeOldJobs`, and `recoverStalledJobs` (stuck PROCESSING → requeued).
- BullMQ also redelivers stalled jobs via lock expiry (`lockDuration` 120s);
  the pipeline is idempotent, so redelivery is safe.
- If a specific video keeps failing with a permanent code
  (PRIVATE_CONTENT, VIDEO_UNAVAILABLE, FILE_TOO_LARGE), it will NOT retry —
  check the source link before forcing a retry.

### Queue grows rapidly / 503 SERVICE_BUSY
- `MAX_QUEUE_SIZE` is doing its job. Do NOT just raise it: check worker
  throughput first (`job_processing` durations in metrics).
- Raise `WORKER_CONCURRENCY` only with CPU/mem/disk headroom (yt-dlp+ffmpeg
  are heavy; start 1–2 per 2 CPU / 2 GB).
- Sustained flood from one IP: tighten `RATE_LIMIT_REQUESTS`; polling abuse:
  tighten `RATE_LIMIT_STATUS_REQUESTS` (legit polling is 1–3s intervals).

### Redis fails
- Web: `POST /api/download` returns controlled 503 (never fake success);
  rate limiting fails open with in-memory fallback per instance.
- Jobs already in BullMQ wait; on Redis return the worker resumes.
- Redis holds no durable state — Postgres is the source of truth. No restore needed.

### PostgreSQL fails
- Web/worker health goes `error` on `db`. Requests fail closed (500/503, no
  misleading success). Restore from backup; jobs created during the outage
  were never accepted, so nothing is half-written (create-then-enqueue means
  a crash between the two leaves a QUEUED row the next recovery sweep picks up
  via `findStalled` once it ages past `STALL_TIMEOUT_MS` — note: fresh QUEUED
  rows are NOT auto-requeued until they become PROCESSING and stall; if the
  web accepted a job but died before enqueue, requeue it manually by id).

### Object storage fails
- Worker marks the job FAILED (never falsely COMPLETED); local tmp is cleaned.
- Expiry sweep keeps COMPLETED rows when deletion fails and retries later —
  investigate before the bucket fills.

### Downloads suddenly fail (all providers, new error codes)
- Check `yt-dlp --version` in the worker image; upstream extractor changes
  break often. Rebuild the worker image (picks up latest yt-dlp) and redeploy.
- If FFmpeg merge fails, jobs surface PROCESSING_FAILED; check worker disk
  (`/tmp` tmpfs 2G — large files + concurrency can exhaust it).

### Admin access needed in an emergency
- Promote via SQL (see `docs/admin.md` bootstrap). All admin actions are
  audited — use real reasons.
- Maintenance mode: `/admin/feature-flags` → `maintenance_mode` on. Public
  POSTs get 503; in-flight jobs finish; turn it off to resume.

### Disk usage high
- `cleanupStaleTempDirs` covers crashed runs; active per-job dirs vanish after
  each job. If still growing: lower `WORKER_CONCURRENCY`, lower
  `MAX_FILE_SIZE`, shorten `FILE_TTL_MINUTES`.

### Error rate increases (source-platform failures are normal)
- Alert on *infra* codes (TIMEOUT, TEMPORARILY_UNAVAILABLE), not on
  PRIVATE_CONTENT/VIDEO_UNAVAILABLE/GEO_RESTRICTED — those are expected.

## Notes & assumptions
- **Auth**: bcryptjs (cost 12) password hashes, opaque server-side sessions
  (HttpOnly, SameSite=Lax, Secure on https, 30-day expiry). Rate-limited
  login/register endpoints. Password resets are single-use, 1-hour tokens.
- **Billing**: Stripe is the payment provider (see `src/lib/billing/stripe.ts`);
  card data never touches our servers. Webhooks are signature-verified and
  idempotent (`webhook_events` ledger — replays return success). Subscription
  downgrades evaluate lazily at entitlement time, so missed webhooks self-heal
  on period end; reconcile with Stripe dashboard if in doubt.
- **Test billing** (`BILLING_PROVIDER=test`, non-production only) exercises the
  real activation/cancel/downgrade path without money.
- **CSRF**: no cookie/session auth exists, so CSRF exposure is minimal
  (JSON APIs, no ambient credentials). Revisit when cookie auth lands.
- **CORS**: no `Access-Control-Allow-Origin` is ever set — same-origin only.
- **TRUST_PROXY**: `X-Forwarded-For` is honored only when `TRUST_PROXY=true`.
  Set it only behind a proxy you control that overwrites the header.
- **Redirect SSRF**: the initial URL is allowlisted + DNS-checked and
  re-validated at execution, but redirect targets followed internally by
  yt-dlp cannot be allowlisted — the worker container/network egress is the
  isolation boundary. Restrict worker egress to required hosts if possible.
- **Secrets**: Postgres/Redis/S3 credentials are server-side only; signed URLs
  are short-lived (`SIGNED_URL_TTL_SECONDS`) and per-object.

## Rollback
- Web/worker: redeploy previous image tags (stateless; safe anytime).
- Migration `001_jobs.sql`: additive (new table + indexes) — rolling code back
  does not require a DB rollback. Future migrations must stay backward
  compatible with the previous release (expand-then-contract).
