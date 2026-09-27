# SnapFlow Developer API — quickstart

Base path: `/api/v1` (a future `api.*` domain stays path-compatible).
Auth: `Authorization: Bearer sf_live_...` — never in query strings.

## 1. Create an API key

Premium plan required. In the dashboard: **Developer → New key**,
pick scopes, store the shown value — it appears exactly once.

```bash
export KEY=sf_live_REPLACE_WITH_YOUR_KEY
```

## 2. Create a download (async — returns 202)

```bash
curl -X POST "$BASE/api/v1/downloads" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-per-request" \
  -d '{"url":"https://www.tiktok.com/@user/video/123","format":{"kind":"video","maxHeight":720}}'
# {"id":"...","status":"QUEUED","status_url":"/api/v1/downloads/..."}
```

## 3. Poll status until terminal

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/api/v1/downloads/<id>"
# COMPLETED includes media + a short-lived download.url (expires_at shown).
```

## 4. Batches

```bash
curl -X POST "$BASE/api/v1/batches" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://.../1","https://.../2"]}'
# {"id":"batch_...","status":"QUEUED","total":2,...}
```

Per-URL failures are reported per item; the aggregate becomes
`PARTIALLY_COMPLETED` rather than failing everything.

## 5. Webhooks

Create an HTTPS endpoint in **Developer → Webhooks**, subscribe to events
(`download.completed`, `batch.partial`, …), keep the shown secret.
Deliveries carry `X-SnapFlow-Signature: t=<ts>,v1=<hmac-sha256(secret, ts.body)>`.
Verify timestamp freshness and compare digests in constant time.

## Limits & errors

- Downloads/batches count against your plan quota (429 `QUOTA_EXCEEDED`
  / `PLAN_LIMIT_REACHED`); per-key rate limits return 429 with `Retry-After`
  and `X-RateLimit-*` headers.
- Errors share one shape: `{error:{code,message,request_id}}`.
- Replaying an `Idempotency-Key` with a different body returns 409
  `IDEMPOTENCY_CONFLICT`.
- Full reference: [`/openapi.json`](../openapi.json), details in
  `authentication.md`, `downloads.md`, `batches.md`, `webhooks.md`,
  `errors.md`, `rate-limits.md` beside this file.
