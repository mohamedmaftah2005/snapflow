# Worker Scaling Model (Phase 14)

## Queues and consumers

| Queue | Worker | Concurrency | Notes |
|---|---|---|---|
| `downloadQueue` | download worker | `WORKER_CONCURRENCY` (2) | Media jobs; lock `WORKER_LOCK_MS` (300s) |
| `archiveQueue` | archive worker | `ARCHIVE_CONCURRENCY` (1) | Isolated since Phase 14 — ZIP builds never starve downloads |
| `webhookQueue` | webhook worker | `max(1, floor(concurrency/2))` | Bounded retries, auto-disable at 10 consecutive failures |
| `growthQueue` | growth worker | 2 | Email sends, idempotent rows |

## Scaling signals (in priority order)

1. **Queue depth** (`pendingDepth`: waiting+delayed+active). Sustained
   growth ⇒ add workers. Hard ceiling `MAX_QUEUE_SIZE` (100) ⇒ 503
   admission control, never unbounded backlog.
2. **Queue wait time** (admission → pickup). Steady-state goal < 30s.
3. **Worker CPU** sustained > 80% ⇒ add workers (media is CPU-bound
   during transcode/merge; network-bound during fetch).
4. **Heartbeat `activeJobs`/`capacity`** (fixed in Phase 14 —
   previously always 0). `GET /api/admin/system` exposes beats.
5. **DB pool saturation** > 80% sustained ⇒ stop adding web replicas
   before adding read capacity; workers share the same budget.

## Scaling procedure

```text
Low pressure (depth < 25% of MAX_QUEUE_SIZE)
  → minimum workers (1 process, concurrency 2)

Rising pressure (depth 25–75%, wait < 30s)
  → add worker processes (stateless; BullMQ distributes)

Sustained high pressure (depth > 75% or wait > 60s)
  → add workers AND verify CPU/disk/DB headroom first

Saturation (CPU > 85%, disk < 20% free, or pool > 80%)
  → backpressure engages (503s); scaling further is unsafe
  → premium priority keeps paying users first in line
```

Workers are stateless: any number of processes may consume the same
queues. The only shared mutable state is Postgres (job rows, guarded
by status transitions) and Redis (BullMQ coordination).

## Concurrency guidance

Do NOT set `concurrency = CPU cores` blindly. A yt-dlp fetch is
network-bound (1 slot ≈ idle CPU); an FFmpeg transcode saturates 1–2
cores. Start at 2 per process (default), raise only while p50 job time
is flat and CPU stays < 80%. Audio-extraction-heavy mixes want lower
concurrency; direct-download mixes tolerate higher.

## Failure behavior

- Worker crash mid-job: BullMQ reclaim + 60s `recoverStalledJobs`
  sweep reset the row to QUEUED; the pipeline is idempotent.
- Redis down: web fail-open on guards (rate limit, depth) but enqueue
  fails → 503 with quota refund. No silent job loss (row stays QUEUED,
  never marked complete without worker success).
- See `docs/resilience.md` for the full degradation matrix.
