# Production runbook (procedures)

## Deploy a release

Follows `docs/deployment.md` §Deploy order. Record version/date/commit/
migrations/worker changes/rollback notes in the release note.

## Roll back

Web/worker: `systemctl stop snapflow-web snapflow-worker`, point
`/opt/snapflow` at the previous release, start, smoke. Database: do NOT
reverse migrations — restore app compatibility or roll forward
(see deployment.md §Rollback).

## Restart a stuck worker

`systemctl restart snapflow-worker` (drains up to `TimeoutStopSec=300`,
then SIGKILLs leftovers). Verify heartbeat returns in `/admin/system`
and `PROCESSING` rows older than `STALL_TIMEOUT_MS` requeue.

## Recover the queue

Check depth (`/admin/queues`); if Redis was lost, restart Redis empty and
restart workers — PostgreSQL remains the source of truth and startup
recovery requeues stale jobs. Pause first (`?action=pause`) if a flood is
in progress, resume after.

## Disable a degrading provider

`/admin/providers` → Maintenance/Disabled with a reason (audited). New
jobs stop resolving to it immediately in-process and everywhere within the
30s flag refresh. Re-enable the same way.

## Maintenance window

`/admin/feature-flags` → `maintenance_mode` on → public POSTs get 503 with
`Retry-After`; in-flight jobs finish → deploy/migrate → smoke → flag off.
Do not use for routine deploys.

## Restore a backup

Per `docs/disaster-recovery.md` (isolated DB only, verify, migrate, smoke,
then cut over). Never restore over production to "test" a backup.

## Storage cleanup

`/admin/storage` → Run cleanup (idempotent expiry sweep). Failures stay
visible and retry on the next sweep; investigate bucket credentials if they
persist.

## Rotate secrets

Database/Redis/storage/API pepper/webhook keys: create the new credential
alongside the old, update `/etc/snapflow/*.env`, `systemctl restart`
(one tier at a time), verify, then revoke the old. Rotation never requires
code changes. API keys and webhook secrets rotate per-key/endpoint from
the dashboards (old values stop immediately).
