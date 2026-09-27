# API downloads & batches

## Downloads

- `POST /api/v1/downloads` (scope `downloads:create`) with
  `{url, format?}` where format is `{kind:auto}` (default),
  `{kind:video,maxHeight:360|480|720|1080}`, or `{kind:audio}`.
  Only allowlisted shapes are accepted. → `202 {id,status,status_url}`.
- `GET /api/v1/downloads/:id` (`downloads:read`): owner-scoped result.
  Non-terminal states return `{id,status,provider,created_at,status_url}`;
  `COMPLETED` adds `media{type,title,duration,size}` and
  `download{available,url,expires_at}` (short-lived signed URL or local
  file path; `available:false` after expiry).
- `POST /api/v1/downloads/:id/cancel` (`downloads:cancel`): active jobs only.
- `POST /api/v1/downloads/:id/retry` (`downloads:create`): retryable
  failures only; consumes quota like a new download.

## Batches

- `POST /api/v1/batches` (`batches:create`) with `{urls[], format?}`.
  Each URL validates independently; limits are plan-based (absolute cap 25).
  → `202 {id,status,total,completed,failed,items[]}`.
- `GET /api/v1/batches/:id` (`batches:read`): aggregate progress
  (`COMPLETED`/`PARTIALLY_COMPLETED`/`FAILED`/…), never another user's jobs.

## Providers / account / usage

- `GET /api/v1/providers` (`providers:read`): enabled providers +
  truthful capability lists only.
- `GET /api/v1/account` (`account:read`): `{plan,status}` — no personal data.
- `GET /api/v1/usage` (`usage:read`): `{period,downloads{used,limit},
  concurrent_jobs{limit}}` from the same entitlement service as the dashboard.
