# Rollback — SnapFlow

Principle: roll forward, never auto-reverse the database. All
migrations 001–008 are additive (`IF NOT EXISTS`); no procedure here
drops tables, columns, or constraints.

## Application (web)

1. Note the current release (commit/version from `/api/health`).
2. Deploy the previous known-good build to staging; run smoke.
3. Swap production traffic to it (systemd unit redeploy or reverse
   proxy target). No DB change is required for app rollbacks because
   schema is additive and code tolerates missing new columns.

## Worker

1. Stop workers gracefully (`SIGTERM`; `TimeoutStopSec=300` lets the
   current job finish; BullMQ reclaims anything interrupted).
2. Deploy the previous worker build; it consumes the same queues
   (payloads are `{jobId,…}` identifiers — version-compatible).
3. Startup `recoverStalledJobs` requeues anything left PROCESSING.

## Configuration / flags (fastest rollback)

Most launches should be flag-gated: `maintenance_mode`,
`provider_<id>_enabled`, `batch_downloads`, `audio_extraction`,
`zip_downloads`, `api_enabled`, `marketing_enabled`,
`referrals_enabled`, `affiliates_enabled` — all DB-backed, effective
within ~30s, audited. Prefer flipping a flag over redeploying.

## Migrations

- Never run `DROP`/`TRUNCATE`/rewrites as a rollback. If a migration
  caused harm, write a new forward migration (expand/contract:
  additive schema → tolerant code → backfill → switch → remove later).
- Queue compatibility: payloads stay identifier-only across versions.
- Storage: objects are content-addressed by job/file ids with TTLs;
  no rollback action needed.

## After any rollback

Verify `/api/ready`, queue depth draining, worker heartbeats, error
rate baseline — then write the post-incident note per
`docs/incident-response.md`.
