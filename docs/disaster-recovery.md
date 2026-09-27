# Disaster recovery

Realistic targets for the documented native setup (single Postgres host,
daily backups, Redis as cache, S3-compatible storage):

- **RPO ≤ 24h** for job/user metadata (daily `pg_dump`); ~0 for media files
  already in versioned/object storage. Enable managed point-in-time recovery
  where the provider offers it to tighten RPO toward minutes.
- **RTO ~1h**: reprovision web+worker from the release directory, restore DB,
  verify with `doctor` + smoke, reopen traffic.

## PostgreSQL backup

Nightly (cron on a host with DB access, creds from the secrets file only):

```sh
pg_dump "$DATABASE_URL" | gzip > /var/backups/snapflow/pg-$(date +%F).sql.gz
```

- Encrypt at rest (disk encryption or `gpg --encrypt` to an offline key),
  retain 14 daily + 4 weekly copies, keep one off-site copy.
- Backups are never public, never in the repo.
- **Restore drill monthly** into an isolated database:
  `gunzip -c <backup> | psql <empty-db>`, run migrations forward if needed,
  point a staging web at it, run smoke. A backup never restored is unverified.

## Redis failure

Redis holds no durable state (jobs live in Postgres). Recreate Redis empty,
restart workers. Stuck `PROCESSING` rows older than `STALL_TIMEOUT_MS` are
requeued automatically by worker startup recovery; BullMQ stalled-job
detection covers in-flight BullMQ jobs.

## Worker failure

Redeploy/restart the worker unit; startup recovery (`recoverStalledJobs`,
stale-tmp sweep, retention purge) runs before consuming. In-flight yt-dlp
processes are terminated by graceful shutdown; their jobs retry or fail
safely by classification.

## Storage failure

Verify provider/credentials/bucket config first (see `/api/admin/system`).
Failed uploads mark jobs FAILED (never falsely COMPLETED); expiry sweeps
retry deletions later. Media already expired is gone by design.

## Full infrastructure failure — recovery order

1. DNS / edge, 2. PostgreSQL (restore + verify + migrate), 3. Redis (fresh),
4. object storage (verify config/buckets), 5. secrets, 6. web, 7. workers,
8. smoke + monitoring, 9. reopen traffic.
