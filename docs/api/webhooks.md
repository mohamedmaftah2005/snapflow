# API webhooks

Subscribe in **Dashboard → Developer → Webhooks** (max 5 endpoints):
HTTPS URLs only (http allowed solely for localhost in non-production),
validated at creation; events selectable per endpoint; secret shown once
(stored AES-256-GCM encrypted, rotated or deleted anytime).

## Delivery

- Events: `download.completed|failed|canceled`, `batch.completed|partial|
  failed|canceled`, `test.event`. Payload:
  `{id,type,created_at,data}` with ids/statuses only — no secrets, keys,
  or worker logs.
- Headers: `X-SnapFlow-Signature: t=<unix>,v1=<hmac-sha256(secret,
  "<unix>.<raw-body>")>` plus `X-SnapFlow-Event`. Verify the timestamp is
  recent and compare with a constant-time equality check.
- Dedicated `webhookQueue`, 5 attempts with exponential backoff for
  network/timeout/5xx; 4xx outcomes are terminal (recorded, not retried).
  10s outbound timeout, 64 KB response cap, max 3 redirects — every hop
  revalidated against SSRF rules (private/loopback/link-local/metadata
  ranges, redirect-to-private included). 10 consecutive failures auto-disable
  the endpoint (visible in the dashboard).
- `POST .../webhooks/:id/test` sends `test.event` through the real queue
  and signer without creating a download. Deliveries list shows
  event/endpoint/status/HTTP status/attempts (payloads stay server-side).
