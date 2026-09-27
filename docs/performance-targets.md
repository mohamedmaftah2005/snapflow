# Performance Targets (Phase 14)

Engineering goals, not guarantees. All latencies are server-side
(request received → response sent) unless noted. Percentiles assume
steady state on staging-equivalent hardware; fill in measured values
in `docs/capacity-planning.md` after load tests.

Timezones: all server timestamps UTC; dashboards display conversions
only.

## Web / API (p50 / p95)

| Operation | p50 goal | p95 goal | Notes |
|---|---|---|---|
| Homepage (cached shell) | < 300 ms | < 800 ms | Server render, no client fetch on load |
| `POST /api/download` | < 400 ms | < 1.5 s | Dominated by DNS validation + ~4 DB RTTs |
| `POST /api/batch` (10 URLs) | < 2 s | < 6 s | Bounded-parallel validation; see §API |
| `GET /api/download/[id]` | < 150 ms | < 500 ms | 1–2 DB reads + presign (CPU-only) |
| `GET /api/downloads` (page) | < 200 ms | < 600 ms | Cursor page, single query |
| v1 API auth + create | < 500 ms | < 2 s | HMAC + indexed lookup + create path |
| Admin dashboard/growth | < 800 ms | < 2 s | Served from 60s aggregate cache |

## Queue

| Signal | Goal |
|---|---|
| Queue wait (admission → worker pickup), steady state | < 30 s |
| Depth sustained > `MAX_QUEUE_SIZE` | 503 with `SERVICE_BUSY`, never silent drop |
| Retry volume | < 5% of enqueues (higher ⇒ provider incident) |
| Stalled-job recovery | < 5 min (periodic sweep + BullMQ reclaim) |

## Worker

| Signal | Goal |
|---|---|
| Single download, video ≤100 MB | complete < 90 s (`JOB_TIMEOUT`) |
| yt-dlp spawns per job | ≤ 2 (download + metadata); audio adds 0 new probes (cached) |
| Worker CPU sustained | < 80% (headroom for bursts) |
| Worker disk free | > 20% at all times |
| Duplicate execution (lock expiry) | ~0 (lock ≫ worst-case job time) |

## Database

| Signal | Goal |
|---|---|
| Hot-path query latency (get/create/update by id) | p95 < 50 ms |
| List pages (history, admin) | p95 < 300 ms, single query + no COUNT |
| Slow-query log threshold | 1 s (`DB_SLOW_QUERY_MS`), zero sensitive params logged |
| Pool saturation | < 80% of max per store, sustained |
| Statement timeout | 15 s (`DB_STATEMENT_TIMEOUT_MS`) — no runaway queries |

## Redis

| Signal | Goal |
|---|---|
| Command latency p95 | < 5 ms (local network) |
| Memory | bounded; no value > 64 KB except BullMQ job data (small by design) |
| Queue-related keys | namespaced `bull:*`, `rl:*`, `idem:*`, `worker:heartbeat:*` |
| Limiter fallback map | capped at 10k keys with expiry pruning |

## Storage

| Signal | Goal |
|---|---|
| Upload | streaming, memory flat regardless of file size |
| Signed-URL generation | < 50 ms (CPU-only presign) |
| Object lifetime | `FILE_TTL_MS` (30 min default); FAILED/EXPIRED rows purged after 7 d |
| Orphan rate | ~0 (DB-driven deletes + documented lifecycle) |
| `notifications` / `email_logs` retention | 90 d rolling purge |

## Frontend (lab + field)

| Signal | Goal |
|---|---|
| Homepage JS | downloader island only; below-fold dynamic |
| LCP (homepage, cable/4G lab) | < 2.5 s |
| CLS | < 0.1 (reserved ad slots, no late layout shifts) |
| Background polling | paused when tab hidden; stops after sign-out |

## Reliability

Error budget thinking (internal): 99.5% monthly success for job
creation; 99% for worker completion excluding provider outages.
Security boundaries (auth, SSRF checks, rate limits, signed URLs,
audit logs) are never tradable for latency — see `docs/resilience.md`.
