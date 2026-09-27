# API errors

One envelope everywhere: `{error:{code,message,request_id}}` with an
appropriate HTTP status (never 200-for-errors):

| Code | Status | Meaning |
|---|---|---|
| INVALID_API_KEY | 401 | Bad, revoked, or expired key (generic on purpose) |
| INSUFFICIENT_SCOPE | 403 | Key lacks the required scope |
| FORBIDDEN | 403 | Valid key, not allowed (e.g. suspended context) |
| INVALID_REQUEST | 400 | Malformed body/fields/IDs |
| INVALID_URL | 400 | Unparseable URL |
| UNSUPPORTED_PROVIDER | 422 | Valid URL, unsupported host |
| DOWNLOAD_NOT_FOUND | 404 | Unknown ID or not yours (no enumeration oracle) |
| QUOTA_EXCEEDED | 429 | Plan quota exhausted |
| PLAN_LIMIT_REACHED | 429 | Legacy web flow equivalent |
| RATE_LIMITED | 429 | Per-key rate limit (+ `Retry-After`, `X-RateLimit-*`) |
| IDEMPOTENCY_CONFLICT | 409 | Same key, different body |
| PROVIDER_UNAVAILABLE | 503 | Maintenance or provider outage |
| INTERNAL_ERROR | 500/502 | Never includes stack traces or paths |
