# Security — SnapFlow

Living posture document (see also `docs/security-review.md` for the
point-in-time review and `docs/final-product-audit.md` §Security).

## Boundaries (never tradable for latency or conversion)

- **Auth**: bcrypt-12, sha256-stored session/token hashes, 30d sliding
  sessions, single-use verify (24h) / reset (1h) tokens, reset kills
  all sessions, generic messages (no enumeration) + timing parity.
- **SSRF**: DNS allowlist validation on every URL intake, per-hop
  revalidation on webhook redirects, 3-redirect cap, 64 KB body cap.
- **Command execution**: argv arrays only (`shell:false`), 8 MB stdout
  cap, 90s SIGKILL timeout, user input never interpolated.
- **IDOR**: ownership checks on every job/file/batch/API detail route;
  404 (no existence oracle).
- **CSRF**: `SameSite=Lax` cookies + edge Origin/Referer enforcement on
  all `/api` mutations except key-authenticated v1 and signed payment
  webhooks (`src/proxy.ts`).
- **XSS**: no user HTML; single escaped static JSON-LD.
- **SQL**: fully parameterized; dynamic filters never interpolate input.
- **Traversal**: storage keys sanitized + `startsWith(root)` enforced;
  archive member names server-generated and validated.
- **Keys/secrets**: HMAC-SHA256 API keys with timing-safe compare;
  webhook HMAC verification; secrets never leave the server (responses
  carry DTOs only); repo secret-scan clean; env-only configuration.

## Operational controls

- Per-surface rate limits (Redis, fail-open); per-user in-flight cap;
  queue depth admission control with quota refunds.
- Admin RBAC (`requirePermission`), confirmations, reason-required
  destructive actions, full audit log.
- Kill switches without redeploy: providers, batch, audio, zip, public
  API, marketing, referrals, affiliates, full maintenance.
- Signed short-lived URLs (900s); private objects never proxied except
  on the local dev driver.

## Known residual risks

- Rate limits fail open (self-DoS traded for availability under Redis
  outage — deliberate, logged).
- Absent-Origin requests allowed through the CSRF proxy (non-browser
  clients; browsers always send Origin on POST).
- Email is log-only until a production driver is wired (launch blocker).
- Jurisdiction-specific legal review outstanding (see DMCA/terms notes).
