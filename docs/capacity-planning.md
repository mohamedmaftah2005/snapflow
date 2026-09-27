# Capacity Planning & Load Testing (Phase 14)

## Baseline capacity (single process, defaults)

- Worker throughput ≈ `concurrency / p50_job_time` = 2 slots; at a
  30s p50 job ≈ 240 jobs/hour per worker process.
- Admission ceiling: `MAX_QUEUE_SIZE` 100 pending + per-user cap 5.
- DB budget: 19 connections per process (web + worker ≈ 38/host).
- Storage steady state bounded by 30-min TTL; burst ceiling is disk
  (`concurrency × maxFileSize` + archive staging up to ~1 GB).

## Bottleneck order (expected, verify by measurement)

1. Worker concurrency (first ceiling under sustained load).
2. Queue depth cap (bursts ⇒ 503 by design).
3. Egress bandwidth (no CDN; linear in completed bytes).
4. Postgres connections (when adding web/worker replicas).
5. Disk on local-driver hosts (archive staging + TTL window).

## Scaling triggers

Add a worker process when queue wait > 30s sustained; stop adding
replicas when any of CPU > 80%, disk free < 20%, or pool > 80%
sustained. Add web replicas when API p95 exceeds targets with spare
DB headroom.

## Maximum tested throughput

_Not yet measured on staging._ Dev-mode sanity run (2026-09-27,
Turbopack dev server, local drivers — NOT representative of prod):

- 30× invalid-URL `POST /api/download`: 10× 400 + 20× 429 (IP budget
  10/min engaged correctly); post p50 16 ms / p95 37 ms.
- 20× status polls (`/api/download/<missing>` → 404): p50 32 ms /
  p95 1311 ms (first-hit compile outlier).
- `scripts/smoke.mjs`: ALL GREEN (8/8) incl. new `/api/status` check.
- Live CSRF verification: cross-site Origin POST → 403; same-request
  without Origin → normal 400 validation.

Populate staging numbers after running the scenarios below; never
invent numbers here.

## Load-test strategy (staging only — never production)

`scripts/load-test.mjs` covers the safe subset today: validation +
rate-limit paths with invalid URLs (never touch yt-dlp) and 404
status polls. Extend per scenario:

| Scenario | Method | Success criteria |
|---|---|---|
| A. Homepage traffic | GET `/` concurrently | p95 < 800ms, 0 errors |
| B. Download creation | POST valid URLs, throttled | p95 < 1.5s, 503s only beyond cap |
| C. Queue spike | burst 3× MAX_QUEUE_SIZE creates | clean 503s, quota refunds, no drops |
| D. Worker saturation | CPU-heavy (audio) mix | wait grows, no lock-expiry duplicates |
| E. Batch workload | 25-URL batches | bounded request time, depth counted |
| F. Public API | keyed creates at limit | 429s beyond quota, auth stays fast |
| G. Webhook backlog | dead endpoint soak | auto-disable at 10 fails, queue drains |
| H. DB pressure | history/admin pages during load | p95 < targets, no pool exhaustion |

Record per scenario: requests/jobs, concurrency, throughput,
p50/p95/p99, error rate, CPU/mem/disk, pool usage. Append results
to this file with date + environment — that is the only acceptable
source for "maximum tested throughput".
