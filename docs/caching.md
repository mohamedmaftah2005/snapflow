# Caching Strategy (Phase 14)

Every cache below defines key, TTL, invalidation, isolation, and
stale-data tolerance. Rule of thumb used throughout: cache aggregates
and slow-changing config, never auth decisions, billing state, or
per-user data.

## 1. Feature flags — `src/lib/admin/flags.ts`

- Key: flag name, in-process `Map`. TTL: 30s refresh, single-flight.
- Invalidation: `setFlag` writes through to the in-process cache.
- Isolation: server-only, never serialized to clients.
- Stale tolerance: 30s of stale flags across instances (documented,
  safe for operational toggles).
- Added in Phase 14: `referrals_enabled`, `affiliates_enabled`.

## 2. Admin aggregates — `src/lib/cache.ts`

- Keys: `admin:dashboard`, `admin:growth`. TTL: `ADMIN_STATS_TTL_MS`
  (default 60s). Bounded (200 entries), single-flight on stampede.
- Invalidation: TTL expiry only — acceptable because responses carry
  `cachedAt` and dashboards are operational views, not billing truth.
- Isolation: admin-only routes (`ADMIN_VIEW`); never cached per-user data.
- Stale tolerance: up to TTL; UI should render "Updated X ago".

## 3. Format probing — `POST /api/download/formats`

- Server caches provider format metadata 10 min (pre-existing).
- Client debounces 600ms per keystroke-pause; unchanged.

## 4. Binary probes — `checkBinaryAvailable` memoization

- Key: `"<bin> <args>"`, process-lifetime memo.
- Rationale: binaries don't appear/disappear mid-process; the worker
  `--healthcheck` verifies them independently at startup.
- Effect: audio jobs no longer spawn an extra `ffmpeg -version`.

## 5. Idempotency stores (also caches)

- Web `idem:{key}` in Redis/memory, TTL = `fileTtlMs`; v1 ledger in
  Postgres, 24h TTL with lazy + swept expiry.

## Explicitly NOT cached

- Authorization/session lookups (per-request DB read; cheap indexed PK).
- Entitlement/subscription state (billing truth; read fresh).
- Signed URLs (900s presigned lifetime is the only validity window).
- Job status (poll-driven; `no-store` by design).
- Webhook secrets (decrypted per delivery from the endpoint row).

## Redis key namespaces

`bull:*` (BullMQ internals), `rl:*` (rate limits, window TTLs),
`idem:*` (idempotency, file-TTL), `worker:heartbeat:*` (90s TTL).
No media bytes, no payloads > 64 KB outside BullMQ job data
(which is small by type contract).
