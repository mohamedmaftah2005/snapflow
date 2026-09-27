# SnapFlow deployment (native, no Docker)

Web (`snapflow-web.service`) and worker (`snapflow-worker.service`) are
separate systemd units in `deploy/systemd/` and scale independently —
heavy yt-dlp/FFmpeg work never runs in the web runtime.

## Environments

`APP_ENV` selects `development | staging | production`. Each environment
gets its own database, Redis, bucket, Stripe account/mode, and secrets.
Never point development at production infrastructure.

## One-time host setup (per environment)

1. Node.js 24, PostgreSQL 16, Redis 7, Python 3 + `yt-dlp`, `ffmpeg`.
2. System user: `useradd -r -m -d /opt/snapflow snapflow`.
3. Checkout + `npm ci` (lockfile-strict, never `npm install` in prod) into `/opt/snapflow`, owned by `snapflow`.
4. Secrets live in `/etc/snapflow/web.env` and `/etc/snapflow/worker.env`
   (mode `0600`, root-owned) — never in the repo, images, or docs.
   Required production keys: `DATABASE_URL`, `REDIS_URL`, `APP_URL` (https),
   `API_KEY_PEPPER`, `WEBHOOK_SECRET_KEY`; plus storage/Stripe keys per driver.
   See `.env.example` for the full list (values never committed).
5. `npm run doctor` with `APP_ENV=production` must exit 0 before traffic.

## Deploy order (every release)

1. CI green (lint, typecheck, tests, build, audit) on the release commit.
2. Record release: version, commit, timestamp (`GIT_COMMIT`/`BUILD_TIME`
   envs surface them at `/api/version`).
3. Apply migrations **before** starting new code: `001`→`006` in order with
   `psql $DATABASE_URL -f db/migrations/<file>` (repeatable `IF NOT EXISTS`;
   additive only — see zero-downtime rule below).
4. Restart worker units (they drain: SIGTERM → finish current job → exit,
   `TimeoutStopSec=300`), then web units.
5. `node scripts/smoke.mjs <base>` must print ALL GREEN (homepage, health,
   readiness, version, v1 envelope, openapi, robots).
6. Watch `/admin/system` + metrics for 15 minutes (queue depth, error rate).

## Zero-downtime rule

Migrations must be additive and backward compatible (add column → deploy
code that tolerates both → backfill → use new column; never drop-then-deploy).
Web/worker versions may briefly coexist: queue payloads stay compatible
(extra fields optional, never renamed without a version bump).

## Rollback

- Web/worker: restart previous release directory (keep two releases on disk).
- Database: **never auto-reverse migrations** — restore app compatibility
  or roll forward; backward DB rollback risks data loss (see disaster-recovery).
- If migration succeeded but deploy failed: keep serving old code only if it
  tolerates the new schema (guaranteed by the rule above).

## Resource envelope (per worker host)

2 CPU / 2 GB RAM, `WORKER_CONCURRENCY=2`, `JOB_TIMEOUT=90s`,
`MAX_FILE_SIZE=100MB`, `MAX_BATCH_ARCHIVE_SIZE=500MB`, tmpfs/PrivateTmp
`/tmp`. A malicious or broken job cannot exhaust the host beyond these.
