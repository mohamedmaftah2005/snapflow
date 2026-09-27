# SnapFlow admin control plane

Internal operations console at `/admin` (dashboard, users, jobs, queues,
providers, storage, billing, abuse, flags, audit, system). Never indexed
(`noindex` on every admin page, excluded from sitemap), never linked from
public pages.

## First admin bootstrap (manual setup, required once)

There is no self-service promotion. After applying migration `004_admin.sql`:

```sql
UPDATE users SET role = 'ADMIN' WHERE email_lower = 'you@example.com';
```

Further role changes happen only through audited admin actions or direct DB
access by infrastructure owners.

## Roles (least privilege)

| Role | Can |
|---|---|
| USER | Public product only |
| SUPPORT | View users/jobs/billing/audit/system; no changes |
| OPERATOR | SUPPORT + retry/cancel/expire jobs, pause/resume queue, enable/disable providers, suspend-lift abuse actions |
| ADMIN | Everything, incl. suspend/reactivate users, feature flags, maintenance |

Permissions live in `src/lib/admin/permissions.ts`; every `/api/admin/*`
endpoint enforces them server-side via `requirePermission()` (401/403 JSON,
per-IP rate limited). Frontend buttons are convenience only.

## Key workflows

- **Support lookup**: `/admin/users` → search email/ID → inspect plan, usage,
  subscription, recent jobs. Suspended users' sessions die immediately.
- **Failed job**: `/admin/jobs?status=FAILED` → detail shows error code +
  retryability → Retry (idempotent: only FAILED+retryable, re-enqueues by jobId;
  duplicates rejected) / Cancel (pending only → CANCELED) / Expire early.
- **Provider incident**: `/admin/providers` → Disable/Maintenance with a reason
  (audited). New jobs stop resolving to it at once (in-process cache) and on
  all instances within the 30s flag refresh. Existing jobs run to completion.
- **Queue flood**: `/admin/queues` shows waiting/active/failed; pause/resume
  (BullMQ only — local driver reports unsupported instead of pretending).
- **Storage**: counts + on-demand idempotent expiry sweep. No file browser by
  design — admins never browse private user files.
- **Webhooks**: `/admin/billing` lists the `webhook_events` ledger
  (RECEIVED/PROCESSED/FAILED). Replays are safe (idempotent applier).
- **Flags**: DB-backed, audited, cached 30s. `maintenance_mode` blocks new
  public downloads with 503 + Retry-After; in-flight jobs finish.

## Audit

Every sensitive action writes an append-only `admin_audit_logs` row (actor,
role, action, target, reason, request ID). There is deliberately **no**
update/delete API, no SQL console, no Redis console, no shell, no arbitrary
command editor anywhere in the console.

## Public API operations (`/admin/api`)

- Lookup any user's keys by user ID (metadata only — raw values were never
  stored and cannot be revealed, by anyone).
- Revoke keys (audited as `API_KEY_REVOKED`, immediate effect).
- Webhook health is visible per endpoint in user dashboards; delivery
  failures surface in metrics (`api_webhook_failed_total`) and the webhook
  ledger. Endpoints auto-disable after 10 consecutive failures.

## Security checklist

- [x] Admin authentication via the same secure sessions (HttpOnly/Lax/30d)
- [x] Server-side authorization on every admin endpoint + rate limiting
- [x] SUPPORT read-only; OPERATOR cannot touch users/flags; self-harm blocked
- [x] No password hashes, tokens, card data, or storage secrets in any response
- [x] Destructive actions need confirmation + reason + audit entry
- [x] Admin routes `noindex`, absent from sitemap and public nav
- [x] CSRF: SameSite=Lax session cookies, same-origin JSON APIs, no CORS
- [x] IDOR + privilege-escalation tests pass (see `tests/phase8.test.ts`)
- [x] Suspended users lose sessions immediately; 403s use 404 parity where enumeration matters
