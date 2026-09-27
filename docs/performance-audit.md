# Performance Audit (Phase 14)

Date: 2026-09-27. Method: static inspection of the repository
(migrations, stores, routes, workers, components). No production traffic
was measured — every claim below cites code, not benchmarks. Numbers
marked (default) are current env defaults in `src/lib/config/env.ts`.

## 1. Database

**Connection budget.** Five independent `pg.Pool`s per process
(`jobs` max 5, `accounts` 5, `batches` 3, `api` 3, `growth` 3 = 19
connections/process). Web + worker each instantiate their own set, so a
single host runs ~38 connections before any scaling. No
`idleTimeoutMillis`, `connectionTimeoutMillis`, or `statement_timeout`
is set; `__resetServerWiring()` nulls stores without `pool.end()`.

**Pagination.** Every list is `COUNT(*) + SELECT * … LIMIT/OFFSET`.
Each page costs two scans; deep pages degrade linearly. No cursor
pagination anywhere. Worst offenders: `admin/growth`
(`listUsers(limit:1000)` + up to 200 sequential `listByUser`),
`admin/storage` (two 1000-row fetches), `listCampaigns` (uncapped
`SELECT *`).

**Sort/filter mismatch.** Several hot queries `ORDER BY` columns their
index does not cover: `WHERE user_id … ORDER BY created_at DESC`
(jobs, batches, subscriptions, api keys, endpoints), referrals
(`(referrer,status)` vs `ORDER BY created_at`), `webhook_events`
(`ORDER BY received_at`, no index), `getActiveSubscription`
(`status IN … ORDER BY created_at DESC LIMIT 1` on `(user_id)` only).
`ILIKE %query%` user search is unindexable by construction.

**N+1 loops.** `batchProgress` (N `repo.get` per batch view),
`emitTerminalEvents` batch fan-out, campaign audience resolution,
admin users list (`getEntitlement` per row — inline comment admits it),
admin growth funnel (200 sequential reads), sequential single-row
`INSERT`s for batch/download items.

**Per-write overhead.** `repo.update()` reads before writing (2 RTT);
`recordDelivery` runs a `DELETE … NOT IN (SELECT … LIMIT 100)` prune
subquery on **every** webhook delivery; `getIdempotency` does
SELECT-then-DELETE.

**Expression indexes gap.** `COALESCE(started_at,created_at)` in
`findStalled`/`purgeTerminal` blocks index use on the underlying
columns.

## 2. Redis / BullMQ

**Throwaway clients per request.** `pendingDepth()` builds + closes a
`new Queue()` on every download creation; `enqueueWebhook` /
`enqueueGrowth` build + close a `Queue` per event. Each costs a TCP +
Figure handshake on the hottest paths.

**Payloads are small by design** (`{jobId,url,provider}`,
`{endpointId,eventId,type,data}`, growth email bodies). No blobs or
secrets in Redis. Rate-limit keys are tiny counters with correct TTLs.

**Memory limiter has no eviction.** The in-process fallback
(`src/lib/rate-limit.ts`) is an unbounded `Map` — a slow leak under
key diversity (e.g. per-IP keys behind NAT rotation).

**Heartbeat dead field.** `setActiveJobs()` is never called, so
`activeJobs`/`capacity` in heartbeats always report 0 — scaling
signals cannot use it.

## 3. Queue / workers

**Archive shares the download pool.** `build-archive` jobs run on the
same `downloadQueue` worker with the same `concurrency` (default 2).
One 25-file archive can occupy both download slots for minutes.

**Batch bypasses the depth guard.** `createBatchJob` never calls
`pendingDepth()`/`queueFull()`, so a single 25-URL batch defeats
`MAX_QUEUE_SIZE=100`.

**No per-user in-flight cap.** One user can occupy all global slots
with 90s jobs; priority reorders but never preempts. Only IP rate
limits throttle.

**Stall recovery is startup-only.** `recoverStalledJobs` runs at boot;
mid-run crashes rely solely on BullMQ reclaim while the DB row says
PROCESSING. `lockDuration: 120s` is hardcoded vs `JOB_TIMEOUT 90s` +
metadata ≤60s + upload — long audio jobs can approach lock expiry and
execute twice.

**Local driver gaps.** Archive/webhook/growth bypass the download
semaphore; local webhook/growth have no retry. Acceptable for dev, but
undocumented as such in dispatch code.

## 4. Media pipeline

**Two yt-dlp spawns per job** (download + `--dump-single-json`
metadata, in either order depending on provider). A per-job
`ffmpeg -version` probe spawns a third process for every audio request.

**Good:** media bytes never sit in Node memory (yt-dlp writes files
directly; S3 upload streams; ZIP streams via archiver; file serving
streams). Thumbnails are URL strings, never fetched.

**ZIP waste.** `zlib level 6` on already-compressed MP4/MP3 burns CPU
for ~0% size gain. Archive staging fully materializes members on disk
(peak ≈ members + zip, up to ~1 GB at the 500 MB cap).

**Sequential upload loop** in the pipeline (moot for single-item jobs
today; multi-item would serialize).

**Local-driver disk.** Completed files persist until `FILE_TTL_MS`
(30 min); `concurrency × maxFileSize` plus archive staging can exhaust
small disks.

## 5. API request path

`POST /api/download` does, in order: flag checks (cached), IP rate
limit, body parse, session lookup (DB), **sync DNS (`assertSafeDns`)
inside `validateUrl`**, entitlement lookup (DB), quota reserve (DB
write), depth guard (Redis), job create (DB write), idempotency set
(Redis), enqueue. No media work inline — correct.

`POST /api/batch` multiplies the worst parts: up to 25 **sequential**
DNS validations + N sequential quota reserves + N creates + N
enqueues + a `batchProgress` N-read fan-out, all in the request path.

Status/file/archive routes are `private, no-store` (correct) but
`batchProgress` re-reads every child job per poll, and the dashboard
polls every few seconds per open batch.

## 6. Storage

Uploads stream; signed URLs are CPU-only presigns (900s TTL); expiry
sweeps run every 60s with lazy expiry on read. Gaps: **no S3 orphan
scan** (all deletes are DB-driven — an upload that succeeds after a
DB failure leaks an object), no bucket lifecycle policy in repo,
media proxied through Next.js on the local driver (unavoidable there;
S3 uses 302 → presigned URL, correct). No CDN.

## 7. Webhooks / analytics / admin

Webhooks are fully async with bounded retries (5 attempts, exp
backoff), 10s timeout, 4xx terminal, auto-disable after 10 consecutive
failures — solid. Only wart is the per-delivery prune subquery (§1).

Client analytics is a consent-gated no-op (no ingestion endpoint, no
request-path cost). Server side-effects run in the worker, best-effort
— correct. `notifications` and `email_logs` have **no retention
purge** (grow forever until account deletion).

Admin dashboard fans out 7 parallel counts per load; admin growth
does the 1000-user fetch + 200 sequential reads with no cache — each
page view is O(users).

## 8. Frontend

No client UI libraries; only Next+React+Tailwind ship to the browser.
Pages are server shells with one client island each — healthy. Issues:
47 client components with zero `next/dynamic` (Faq, MediaGallery,
admin tables all eager); `AdSlot` is client yet renders null without a
provider; `NotificationBell` polls forever (30s→120s backoff) even in
background tabs and keeps scheduling after 401; `DownloadDetail`
fetches `?limit=50` to derive one boolean; `Dashboard` re-fetches
`/api/account` already fetched by `AccountNav`; no `fetch` caching /
dedup anywhere; `Geist_Mono` loads globally; no `removeConsole`.

No `next/image` usage at all (nothing to optimize; thumbnails are
never rendered).

## 9. Cost drivers (unmeasured, by inspection)

Worker CPU (yt-dlp + FFmpeg transcode/merge + ZIP deflate) dominates,
then bandwidth (origin egress per download; no CDN), then storage
(30-min TTL bounds steady state; leak risk is orphans, §6), then
Postgres (round-trips per request: ~4–6 for singles, ~4×N for
batches). Redis and email are negligible at current design.

## 10. Scaling limits (qualitative)

1. Global worker concurrency 2 → throughput ceiling ≈ 2 / p50-job-time.
2. Single-queue depth 100 → bursts beyond ~100 concurrent creators get
   503s (by design), except batches bypass it.
3. 19 PG connections per process → a 10-replica web tier needs ~200+
   connections before workers.
4. Admin growth/dashboard cost grows with table size, uncached.
5. `notifications`/`email_logs` grow unboundedly.
