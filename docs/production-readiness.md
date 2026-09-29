# Production Readiness — SnapFlow (Phase 15)

Status as of 2026-09-27 after Phase 15 fixes. Legend: ✅ ready ·
⚠️ ready with documented follow-up · ❌ blocker (manual action).

## Application

| Item | Status | Evidence | Owner/system | Remaining action |
|---|---|---|---|---|
| Production build | ✅ | `npm run build` passes; `tsc`, eslint clean | Next.js | none |
| Environment validation | ✅ | `validateEnv` + `npm run doctor` fail fast; production requires `EMAIL_DRIVER=smtp` + SMTP credentials | scripts/doctor.ts | supply SMTP credentials (manual) |
| Error handling | ✅ | Central `userMessageFor` catalog; 4 raw-message leaks fixed; client renders catalog only | lib/errors.ts | none |
| Authentication | ✅ | bcrypt-12, sha256 tokens, single-use verify/reset, reset kills sessions, no enumeration | lib/auth/service.ts | none |
| Authorization | ✅ | Owner checks on all job/file/batch/v1 routes (404, no oracle); RBAC + audit in admin | routes + lib/admin/guard.ts | none |
| Rate limiting | ✅ | Redis Lua counters, per-surface budgets, fail-open; CSRF proxy added | rate-limit-redis.ts, src/proxy.ts | none |

## Infrastructure

| Item | Status | Evidence | Owner/system | Remaining action |
|---|---|---|---|---|
| Database | ✅ | 8 additive migrations; 14 perf indexes (008); pooled + timeouts + slow-query log | db/migrations, lib/db/pool.ts | apply 008 on staging/prod |
| Redis | ✅ | Namespaced keys, BullMQ coordination only, shared Queue singletons | lib/queue | provision separate staging/prod instances (manual) |
| Workers | ✅ | Isolated archive consumer, lock 300s, stall sweep, heartbeat accounting | src/worker | scale per docs/worker-scaling.md |
| Storage | ✅ | Streaming uploads, 30-min TTL, 60s expiry sweep, signed URLs | lib/storage | set bucket lifecycle policy (manual, recommended) |
| Backups | ⚠️ | `docs/disaster-recovery.md` (RPO≤24h, monthly drill) | ops | verify first restore drill on staging (manual) |
| Monitoring | ⚠️ | /health, /ready, /metrics (token), heartbeats, admin system | lib/health.ts, monitoring.md | connect external alerting (manual); thresholds after 2 wks data |

## Security

| Item | Status | Evidence | Owner/system | Remaining action |
|---|---|---|---|---|
| SSRF | ✅ | DNS allowlist validation, per-hop revalidation, redirect caps | lib/validation/net.ts | none |
| Command execution | ✅ | argv arrays, `shell:false`, output caps, timeouts | services/downloader/ytdlp.ts | none |
| IDOR | ✅ | Ownership checks everywhere (audited) | routes | none |
| CSRF | ✅ | SameSite=Lax + edge Origin/Referer enforcement (v1/webhook exempt by design) | src/proxy.ts | none |
| XSS | ✅ | Single escaped static JSON-LD; no user HTML | JsonLd.tsx | none |
| SQL injection | ✅ | Fully parameterized (audited) | stores | none |
| API auth | ✅ | HMAC keys, timing-safe compare, indexed lookup, kill switch | lib/api, api_enabled flag | none |
| Webhook verification | ✅ | HMAC signatures, ledger dedupe, retry discipline | webhooks/payment | configure Stripe secret per env (manual) |
| Secrets | ✅ | Repo scan clean; `.env.example` placeholders only | — | rotate if ever committed |

## Product

| Item | Status | Evidence | Owner/system | Remaining action |
|---|---|---|---|---|
| Homepage | ✅ | Honest copy (no superlatives), guides linked, maintenance banner | app/page.tsx | real-user comprehension test (manual) |
| Downloader | ✅ | All states mapped, catalog-only errors, cancel confirm, expiry handling | DownloaderCard.tsx | none |
| Dashboard | ✅ | Plan/usage/account/recents + onboarding + resend verification | Dashboard.tsx | none |
| Pricing | ✅ | Generated from PLANS + effective caps + batch/API rows; no dark patterns | pricing/page.tsx | confirm $5 matches Stripe price (manual) |
| Billing | ✅ | Webhook truth, cancel clarity, checkout pending banner, PAST_DUE messaging | Billing.tsx | none |
| Account settings | ✅ | Name/password/delete + notification prefs | Settings.tsx | none |
| History | ✅ | Pagination, status+provider filters, authz, expiry copy, action errors | History.tsx | none |
| Batch | ✅ | Depth guard, per-user cap, maintenance gate, parallel validation | batches/service.ts | none |

## Legal/trust

| Item | Status | Evidence | Owner/system | Remaining action |
|---|---|---|---|---|
| Privacy | ✅ | Matches TTL/deletion/consent behavior | privacy/page.tsx | counsel review per market (manual) |
| Terms | ✅ | Present, accurate | terms/page.tsx | governing law + age floor (manual) |
| DMCA | ✅ | Agent contact, checklist, counter-notice, repeat-infringer policy | dmca/page.tsx | counsel review (manual) |
| Contact | ✅ | mailto + diagnostic guidance | contact/page.tsx | verify inbox monitored (manual) |
| Responsible use | ✅ | Footer + downloader + guides carry permission messaging | — | none |

## Operations

| Item | Status | Evidence | Owner/system | Remaining action |
|---|---|---|---|---|
| Logs | ✅ | Structured JSON, redacted emails, no secrets | lib/logger.ts | ship to aggregator (manual) |
| Alerts | ⚠️ | Thresholds documented; no provider wired | monitoring.md | wire PagerDuty/Opsgenie equivalent (manual) |
| Incident response | ✅ | SEV flow + per-system procedures | incident-response.md | none |
| Rollback | ✅ | Forward-only DB, app/worker/flag procedures | rollback.md | none |
| Recovery | ✅ | Stall recovery, quota refunds, idempotent pipeline | worker/cleanup.ts | drill on staging (manual) |
