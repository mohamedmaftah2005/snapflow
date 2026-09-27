# API rate limits & quotas

- Per-key rate limit (default 100 req/min, `API_RATE_LIMIT_REQUESTS/_WINDOW`),
  keyed by key id — shared infrastructure doesn't punish one developer for
  another. 429s carry `Retry-After` and `X-RateLimit-Limit/Remaining`.
- Quotas reuse the product entitlement service: every API-created download
  or batch item reserves from the owner's daily bucket (premium unbounded
  but still rate-limited). `QUOTA_EXCEEDED` at 429.
- Web batch creation additionally honors plan batch caps; batch children run
  deprioritized so API bulk jobs can't starve interactive users.
- Separate strict buckets already guard auth/admin/status/file/web routes.
