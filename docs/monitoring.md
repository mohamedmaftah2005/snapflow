# Monitoring, alerts, and logs

## Metrics (Prometheus exposition at token-gated `/api/metrics`)

Core: `http_requests_total`, `jobs_created_total{,_provider,_plan}`,
`jobs_completed_total`, `jobs_failed_total`, `timeouts_total`,
`queue_rejected_total`, `plan_limited_total`, `rate_limited_total`,
`idempotent_hits_total`, `batches_created_total`, `archives_built_total`,
`archives_requested_total`, `files_served_total`, `cleanup_failures_total`,
`api_request_total`, `api_download_created_total`, `api_batch_created_total`,
`api_key_created_total`, `api_key_revoked_total`,
`api_webhook_queued/delivered/failed_total`, `api_webhook_test_total`,
`job_processing_ms_{sum,count}`.

## Suggested alert thresholds (tune after 2 weeks of baseline)

- `api/health` non-200 for 2 min → SEV-1; `/api/ready` 503 for 5 min → SEV-1
- Worker heartbeats absent 3 min → SEV-1
- Queue depth > `MAX_QUEUE_SIZE` for 10 min → SEV-2
- Failed-job rate (>10% of completions over 30 min) → SEV-2
- Provider 7d success rate drops >15 points week-over-week → SEV-3
- `cleanup_failures_total` increasing → SEV-3
- Webhook FAILED backlog growing → SEV-3

## Logs

Structured JSON everywhere (`logger`), levels via `LOG_LEVEL`
(DEBUG dev, INFO prod). Every line that can carries `req`/`job`/
`batch`/`key`/`endpoint` ids. Never logged: Authorization headers, API
keys, webhook secrets, passwords, card data, storage credentials.
Retention: app/worker logs 30 days, webhook deliveries 30 days (then
purged by the worker sweep), idempotency rows 24h TTL, audit logs
indefinite (legal/ops requirement — never auto-purged).

## Error tracking

`SENTRY_DSN` forwards `reportError()` events with release/version context;
without it, errors stay in structured logs. Either way, no secrets attached.
