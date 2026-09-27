# Pre-production security review (Phase 11)

Reviewed against the live codebase; findings below are the residual risks,
not open holes (each has a control or a documented follow-up).

| Area | Control in place | Residual risk / follow-up |
|---|---|---|
| Authentication | bcrypt-12, opaque server sessions, HttpOnly/Lax/30d, generic errors | No MFA — acceptable for MVP; revisit with OAuth |
| Authorization | Central `requirePermission` + ownership checks + 404 parity | Admin bootstrap is manual SQL (documented, audited after) |
| API keys | Peppered HMAC storage, prefix lookup, scopes, expiry, instant revoke | Pepper rotation invalidates all keys (documented procedure) |
| Webhooks | HMAC signatures, encrypted secrets, SSRF per-hop validation | DNS TOCTOU between check and connect; container egress is the boundary |
| SSRF (downloads) | Allowlist + IP/CIDR + DNS guard + execution re-check | yt-dlp redirect targets uncontrolled by design (worker isolation) |
| Command execution | argv arrays, `shell:false`, fixed selectors, no user filters | yt-dlp itself parses remote media (upstream risk; pin + stage updates) |
| Path traversal | Regex IDs, server-built keys/names, zip-slip guard (tested) | None known |
| ZIP | 25-file/500MB caps, generated names, staging cleanup | Very large concurrent archives bounded by worker concurrency |
| Rate limiting | Per-endpoint buckets + per-key v1 limits + quotas | Fails open if Redis dies (availability choice, logged) |
| Billing | Stripe-hosted, verified idempotent webhooks, lazy downgrade | Sandbox not run (no keys); reconciliation is manual for now |
| Secrets | Env-only, validated at startup, never logged/bundled | Rotation is procedural (no automation) |
| CI | Lint/typecheck/tests/build/audit gates on every PR | No SAST/container scan (no containers); secret scanning via host config |
| Data | Minimal PII, hashed IPs, 7d/30d retention, anonymized deletion | Staging must never receive prod data (policy + separate creds) |

No arbitrary SQL/shell/Redis consoles exist anywhere, including admin.
