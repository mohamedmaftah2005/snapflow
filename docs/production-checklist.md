# SnapFlow production checklist

Copy this file per environment (staging/production) and check items off.
Never point local development at production infrastructure.

## Infrastructure
- [ ] Separate Postgres, Redis, and storage bucket per environment (dev/staging/prod)
- [ ] Managed equivalents healthy in staging/prod (local dev: `docker compose` for postgres/redis only)
- [ ] Migrations applied in order 001→008: `psql $DATABASE_URL -f db/migrations/008_perf.sql` (last)
- [ ] Web + worker start via systemd units (`deploy/systemd/`; no Dockerfiles in repo)
- [ ] Worker runs unprivileged (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`)
- [ ] Resource caps set (web 1 CPU/1G, worker 2 CPU/2G; `TimeoutStopSec=300` drain)
- [ ] HTTPS terminated at the edge; `APP_URL` is the public https URL
- [ ] DNS points at the deployment; `NEXT_PUBLIC_SITE_URL` matches

## Environment variables (fail fast — worker refuses to start without its own)
- [ ] `DATABASE_URL`, `DB_DRIVER=postgres`, `REDIS_URL`, `QUEUE_DRIVER=bullmq`
- [ ] `STORAGE_*` (least-privilege key: put/get/delete on the bucket only), `STORAGE_BUCKET` private
- [ ] `APP_URL`, `TRUST_PROXY=true` only behind a sanitizing proxy (else spoofable XFF is ignored)
- [ ] `RATE_LIMIT_*`, `MAX_QUEUE_SIZE`, `MAX_REQUEST_BODY_SIZE`, `MAX_FILE_SIZE`, `JOB_TIMEOUT`
- [ ] `WORKER_CONCURRENCY` conservative (start 1–2; raise only with CPU/mem headroom)
- [ ] `FILE_TTL_MINUTES`, `FAILED_RETENTION_DAYS`, `STALL_TIMEOUT_MS`, `STALE_TMP_HOURS`
- [ ] `LOG_LEVEL=info` (prod), `METRICS_TOKEN` set (long random), `SENTRY_DSN` if used
- [ ] No secrets in images, client bundles, or logs (`NEXT_PUBLIC_*` contains no secrets)

## Accounts & billing
- [ ] Migration `003_accounts.sql` applied (users, sessions, subscriptions, usage, webhook ledger)
- [ ] `BILLING_PROVIDER=stripe` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PREMIUM` (test keys in staging, live keys only in prod)
- [ ] Stripe webhook endpoint registered: `POST /api/webhooks/payment`
- [ ] `ENABLE_AUTH/CHECKOUT/BILLING/GUEST_DOWNLOADS` reviewed per environment
- [ ] Test checkout (`/billing/test-checkout`) unreachable in production (flag + NODE_ENV guard)

## Public API (Phase 10)
- [ ] Migration `006_api.sql` applied (api_keys, idempotency, webhook endpoints/deliveries)
- [ ] `API_KEY_PEPPER` set (long random; rotation invalidates all keys — plan it)
- [ ] `WEBHOOK_SECRET_KEY` set (long random; required to create webhook endpoints)
- [ ] `WEBHOOK_ALLOW_PRIVATE` is false in production (loopback targets rejected)
- [ ] `API_RATE_LIMIT_REQUESTS/_WINDOW` reviewed; `/openapi.json` reachable
- [ ] Docs reviewed: `docs/api/` (quickstart, authentication, downloads, batches, webhooks, errors, rate-limits)

## Production infrastructure (Phase 11)
- [ ] `APP_ENV=production`, `npm run doctor` exits 0 (env, binaries, readiness)
- [ ] systemd units installed from `deploy/systemd/`; `NODE_ENV=production`
- [ ] Migrations 001–006 applied in order before code start
- [ ] Nightly `pg_dump` cron + encryption + off-site copy; restore drilled this quarter
- [ ] Staging mirrors prod topology with isolated creds; smoke green before promote
- [ ] CI green on the release commit (lint, typecheck, tests, build, audit)
- [ ] Release recorded (version/commit/`GIT_COMMIT`/`BUILD_TIME` visible at `/api/version`)
- [ ] Monitoring scrapes `/api/metrics`; alerts per `docs/monitoring.md`
- [ ] On-call has completed `docs/incident-response.md` checklist once

## Security
- [ ] Security headers active (CSP, nosniff, DENY framing, HSTS, referrer/permissions policies)
- [ ] `robots.txt` disallows `/api/`; sitemap lists only public pages
- [ ] Redis/Postgres not publicly exposed; strong passwords; TLS where the platform requires
- [ ] `npm audit` clean (last run: 0 vulnerabilities)
- [ ] No `dangerouslySetInnerHTML`, no `eval`, yt-dlp/ffmpeg via argv arrays only (`shell: false`)

## Data & recovery
- [ ] Postgres backups scheduled and restore-tested; Redis treated as ephemeral (jobs rehydrate from PG)
- [ ] S3 lifecycle/expiry policy mirrors `FILE_TTL_MINUTES` as a second layer behind the app sweep
- [ ] Worker restart drill done: stalled jobs requeue via `recoverStalledJobs`, tmp swept, no stuck PROCESSING
- [ ] Rollback plan known (previous image tags for web+worker; migration 001 is additive — safe to roll code back)

## Monitoring
- [ ] `/api/health` 200 (liveness); metrics scraped from `/api/metrics` with bearer token
- [ ] Alerts defined: worker offline (no heartbeat 3m), queue depth > MAX_QUEUE_SIZE, error-rate spike,
      p95 processing time rising, cleanup failures > 0, PG/Redis unreachable
- [ ] Runbook reviewed: `docs/runbook.md`
