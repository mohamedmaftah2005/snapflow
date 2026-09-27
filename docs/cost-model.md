# Cost Model (Phase 14)

Internal planning model. No vendor prices are hardcoded — every price
is an env-overridable assumption documented as such. Replace the
example figures with your infrastructure bills before using this for
decisions.

## Cost drivers (by inspection, §9 of the audit)

```text
Worker CPU      — yt-dlp fetch + FFmpeg transcode/merge + ZIP build (dominant)
Bandwidth       — origin egress per completed download (no CDN)
Storage         — 30-min object TTL bounds steady state; orphans are the leak risk
PostgreSQL      — ~4–6 round-trips per single create, ~4×N per batch create
Redis           — tiny counters + BullMQ coordination (negligible)
Email           — per-send, idempotent outbox (negligible at current caps)
API traffic     — polling (status/batch) dominates over creates
```

## Internal metrics

| Metric | Definition | Source |
|---|---|---|
| `cost_per_1k_downloads` | (worker_hours × hourly_rate + egress_GB × gb_rate) / downloads × 1000 | metrics `jobs_created_*_total` + worker logs |
| `worker_cost_per_hour` | instance_hourly_rate / jobs_completed_per_hour | `job_completed` log events |
| `storage_per_active_user` | bytes under active (unexpired) keys / active users | storage sweep + `usage_daily` |
| `bandwidth_per_download` | egress bytes / `COMPLETED` jobs | `file_size` on job rows |
| `avg_processing_ms_per_provider` | mean(completed_at − started_at) by provider | `providerStats` (admin dashboard) |

Resource attribution is already labeled where it matters:
`jobs_created_{provider}_total`, `jobs_created_plan_{plan}_total`
(bounded by the 5000-series metrics cap).

## Guardrails (operational controls, not punishment)

| Control | Default | Behavior at limit |
|---|---|---|
| `MAX_QUEUE_SIZE` | 100 | 503 `SERVICE_BUSY`, quota refunded |
| `MAX_ACTIVE_JOBS_PER_USER` | 5 | 503, quota refunded, `user_cap_reached` logged |
| Daily plan quotas | guest 5 / free 20 / premium ∞ | 429 `PLAN_LIMIT_REACHED` |
| `MAX_FILE_SIZE` / plan caps | 100 MB | rejected before processing |
| `MAX_BATCH_ITEMS` / archive cap | 25 / 500 MB | rejected before processing |
| `JOB_TIMEOUT` | 90 s | SIGKILL ⇒ retryable failure |
| `FAILED_RETENTION_DAYS` | 7 | rows purged; objects already expired |
| Notification/email-log retention | 90 d | rolling purge in the 60s sweep |

When a limit fires: fail with a clear code, log the reason, keep
admin visibility (`/api/admin/dashboard`), never leave partial state
(reserve-then-refund discipline in both single and batch paths).
