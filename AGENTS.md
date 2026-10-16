<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SnapFlow — agent notes

Next.js 16 App Router + standalone BullMQ worker. Postgres = truth, Redis = queues/rate-limits only, S3-compatible = bytes. No Docker; systemd units in `deploy/systemd/`.

## Commands (CI order matters)

CI (`/.github/workflows/ci.yml`): `npm ci --no-audit --no-fund` → `npm run lint` → `npm run typecheck` → `npm run test` → `npm run build` → `npm audit --audit-level=high` → `npx tsx ./scripts/doctor.ts` (`APP_ENV=development`).

- `npm run dev` / `npm run build` / `npm start` — web. Node >=20, `npm ci` (never `npm install` in prod).
- `npm run worker` — media worker (`src/worker/index.ts`). `npm run worker:healthcheck` — Redis/DB/binaries/storage check, exit 0/1.
- `npm run doctor` — env + `yt-dlp`/`ffmpeg` + readiness. Must exit 0 before traffic when `APP_ENV=production`. Never prints secret values.
- `npm run smoke [baseUrl]` (`scripts/smoke.mjs`) — safe on staging AND prod (no downloads created). Must print ALL GREEN.
- Single test: `npx vitest run tests/<name>.test.ts` (config: `vitest.config.ts`, `environment: node`, `tests/**/*.test.ts`, 30s timeout, `@` → `src/`).
- `npm run typecheck` = `tsc --noEmit`; `npm run lint` = `eslint` (next core-web-vitals + TS).

## Env / driver degradation (src/lib/config/env.ts, src/lib/server.ts)

Copy `.env.example` — never commit secrets, never point dev at staging/prod infra. Each env has isolated DB/Redis/bucket/Stripe/metrics token (see `docs/environment-matrix.md`).

- `QUEUE_DRIVER=bullmq|local` (default: bullmq iff `REDIS_URL` set, else local). Local = web process runs jobs via `src/lib/queue/dispatch.ts`; no separate worker needed.
- `DB_DRIVER=postgres|memory` (default: postgres iff `DATABASE_URL` set). `STORAGE_DRIVER=s3|local` (default: s3 iff bucket+keys set).
- `APP_ENV=development|staging|production` selects validation strictness (`src/lib/config/validate.ts`). Production `doctor` fails fast without: `APP_URL` (https), `DATABASE_URL`, `REDIS_URL`, `API_KEY_PEPPER`, `WEBHOOK_SECRET_KEY`, `EMAIL_DRIVER=smtp` + `SMTP_HOST/USER/PASS`, plus s3/Stripe keys per driver.
- `WEBHOOK_ALLOW_PRIVATE=false` always except local dev. `EMAIL_DRIVER=log` drops mail silently (dev default).
- Feature flags: `ENABLE_TIKTOK=true`, `ENABLE_INSTAGRAM/YOUTUBE=false`; `ENABLE_AUTH/CHECKOUT/BILLING/GUEST_DOWNLOADS`; `NEXT_PUBLIC_*` is the only client-safe subset. Runtime ops flags live in `src/lib/admin/flags.ts` (DB-backed), not env.

## Architecture entrypoints

- Web: `src/app/api/*` (19 groups) → validate → authorize → reserve quota → persist → enqueue. `src/proxy.ts` (`export function proxy`, `matcher: /api/:path*`) is the CSRF edge guard — Next 16 convention, `middleware.ts` is deprecated/ignored.
- Worker: `src/worker/index.ts` → `pipeline.ts` (downloads) / `archive.ts` (isolated ZIP queue) / `webhook-worker.ts` / `cleanup.ts`. Startup does `cleanupStaleTempDirs` + `purgeOldJobs` + `recoverStalledJobs` before accepting work. 4 queues: download (`WORKER_CONCURRENCY`), archive (`ARCHIVE_CONCURRENCY`), webhook, growth. Lock `WORKER_LOCK_MS=300000` must exceed worst-case job time.
- Wiring: `src/lib/server.ts` factories (`getRepository/getQueue/getStorage/getAccountStore/getBatchStore/getApiStore/getGrowthStore`). Per-purpose rate limiters (create/status/file/auth/admin/batch/api) — Redis when available, memory otherwise; limits fail open on Redis loss.
- Invariants: worker decides nothing (jobs arrive authorized); pipeline idempotent; billing rows only from verified webhooks (never trust redirects); media bytes stream file→storage, never in Node memory; thumbnails are URL strings, never fetched; analytics never breaks downloads.

## Providers (src/lib/providers/)

`registry.ts` is the ONLY wiring point. `resolve(url)` maps hostname → enabled provider or `null`, never throws. Never `if (provider === …)` outside registry. `client.ts` is display-only; backend registry is authoritative.

- Status: TikTok enabled, YouTube implemented+tested but disabled (`ENABLE_YOUTUBE=false`, no UI mentions), Instagram not implemented.
- New provider: implement `MediaProvider` (`types.ts`) → `supportsHost` + `normalizeUrl` + `validateUrl` on `validation/net.ts` SSRF base → extract via `runBinary` (argv arrays, `shell: false`) → normalize to `ProviderResult` → register + `ENABLE_<ID>` + tests (see `docs/providers.md`, `tests/phase6.test.ts`).
- Storage keys: `downloads/<jobId>/<itemId>.<ext>` server-generated only. Signed S3 URLs or `/api/files/<jobId>?item=<itemId>` (local).

## DB / tests / deploy gotchas

- Migrations `db/migrations/001–008` in order: `psql $DATABASE_URL -f db/migrations/<file>`. Additive + backward-compatible only (add→deploy tolerant code→backfill→use); never drop-then-deploy, never auto-reverse. Apply before starting new code; queue payloads stay compatible across mixed web/worker versions.
- Tests use memory drivers + `fakeStorage()` (`tests/helpers.ts`); reset singletons via `__resetServerWiring()` and `__resetProviderRegistry()`. Billing/webhook tests use `BILLING_PROVIDER=test` + `TEST_WEBHOOK_SECRET`, never live keys.
- Security: API same-origin only (no ACAO header anywhere); CSP + `X-Frame-Options: DENY` in `next.config.ts`; `proxy.ts` exempts `/api/v1/*` and `/api/webhooks/payment`, allows requests without Origin/Referer (curl/tests). `images.remotePatterns` = `*.tiktokcdn.com`, `*.tiktok.com` only.
- Deploy: web/worker restart separately (worker drains SIGTERM, `TimeoutStopSec=300`); `nixpacks.toml` adds `ffmpeg`+`yt-dlp` for Railway worker only (Vercel/local ignore). `GIT_COMMIT`/`BUILD_TIME` surface at `/api/version`. Watch `/admin/system` + queue depth 15 min post-deploy.
- Source of truth: `package.json` scripts + `src/lib/config/env.ts` + `ci.yml` beat prose. If `docs/` conflicts, trust code. Key docs: `architecture.md`, `deployment.md`, `providers.md`, `environment-matrix.md`, `worker-scaling.md`, `caching.md`.
