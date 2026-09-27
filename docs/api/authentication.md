# API authentication

- Header only: `Authorization: Bearer sf_live_...`. Keys in query strings
  are rejected (`?api_key=` never works — URLs leak via logs).
- Keys are `sf_live_` + 43 random chars (~256-bit entropy). Only a
  prefix + HMAC-SHA256 hash (peppered) is stored; raw values are shown once
  at creation and are unrecoverable afterwards.
- Every response carries `X-Request-ID` (yours if valid, else generated);
  errors include it as `request_id` for support.
- Failure envelope (all endpoints, all statuses):
  `{error:{code,message,request_id}}` with codes like `INVALID_API_KEY`
  (401, generic — never reveals key existence), `INSUFFICIENT_SCOPE` (403),
  `RATE_LIMITED` (429), `QUOTA_EXCEEDED` (429), `IDEMPOTENCY_CONFLICT` (409).
- Keys expire (never/30d/90d/1y), revoke immediately, and stop working when
  the owner is suspended or loses API access (downgrade).
- Scopes (least privilege, chosen at creation): `downloads:create`,
  `downloads:read`, `downloads:cancel`, `batches:create`, `batches:read`,
  `batches:cancel`, `providers:read`, `account:read`, `usage:read`.
