# Final Product Audit — SnapFlow (Phase 15)

Date: 2026-09-27. Method: full-repository inspection (four parallel
audit passes + firsthand verification of every CRITICAL/HIGH claim).
No staging environment was available; browser/device testing and load
measurements are documented as manual follow-ups, not claimed.

Policy: BLOCKER = must fix before public launch. Cosmetic issues are
explicitly NON-BLOCKERs.

## CRITICAL (launch blockers)

1. **Password reset shows false success** (`AuthForm.tsx:58-61` ignores
   `data.reset`; `reset/route.ts:19` returns `reset:false` with
   `success:true`). Users with expired/reused tokens see "Password
   updated" then fail at login. → FIX in this phase.
2. **Premium 500 MB claim vs 100 MB effective cap.**
   `plans.ts` advertises premium 500 MB, but
   `downloads/service.ts:117` computes `min(plan, env.maxFileSizeBytes)`
   with env default 100 MB. Out-of-box buyers get Free-grade caps.
   → FIX: pricing displays the effective (post-min) cap.
3. **Post-checkout confusion.** `checkout/route.ts:25` redirects to
   `/dashboard/billing?checkout=success`, but `Billing.tsx` never reads
   it; webhook arrives async, user sees stale Free. → FIX: pending
   banner + status polling.
4. **No production email driver.** `lib/email.ts` is log-only; verify /
   reset / billing emails never deliver in prod. Cannot responsibly
   invent an SMTP provider here. → FIX: fail-fast doctor warning for
   `APP_ENV=production` + documented manual setup (BLOCKER until wired).

## HIGH (fix before launch)

5. Raw upstream messages to clients: `developer/webhooks` route (`:71`,
   SSRF validator detail), `developer/keys` (`:77-82`), admin
   `campaigns` (`:43,74`), admin `system` (`:17,26` detail). → generic
   messages + server logs.
6. `DownloaderCard` renders raw `err.message`, bypassing
   `userMessageFor`. → client-side code mapping.
7. No session-expiry UX (silent redirect to /login). → `?expired=1`
   message.
8. No maintenance UI: API returns 503 but downloader shows generic
   "busy"; batch/v1 maintenance coverage unverified. → public status
   signal + banner + verify coverage.
9. No resend-verification action (dead "Email not verified yet" text).
   → resend endpoint + button.
10. `PAYMENT_FAILED` lifecycle path is dead (no `invoice.payment_failed`
    handler). → wire it.
11. ~~Auth pages lack noindex~~ — verified present on
    login/register/forgot/reset/verify; fixed instead: robots.txt now
    also disallows `/admin/`, `/dashboard/`, `/billing/` (defense in
    depth alongside per-page noindex).
12. JSON-LD `offers price "0"` while Premium exists. → drop price from
    structured data.
13. DMCA page is a stub (no agent, no checklist, no counter-notice).
    → expand with configured contact; jurisdiction review stays manual.

## MEDIUM (fix now where cheap; otherwise post-launch)

- Footer links to `#how-it-works`/`#faq` anchors instead of canonical
  pages; guides orphaned (one guide has zero inbound links); mobile
  header hides all nav.
- Contact rendered as plain text (no `mailto:`); no response-time SLA.
- Privacy claims VERIFIED in code during Phase 15: 7-day FAILED/EXPIRED
  purge runs in the worker 60s sweep (`failedRetentionMs`, default 7d);
  `sanitizeForLog` strips query/hash/credentials before any URL reaches
  logs. `SupportedPlatforms` now intersects the advertised list with
  backend `ENABLE_*` capability so the UI cannot promise what the
  backend rejects.
- Pricing omits batch limits/API/priority entitlements; batch UI never
  surfaces per-plan batch size.
- Billing: raw `PAST_DUE` with no payment-update CTA; no
  resume/reactivate; no invoices (by design — secrets never to client).
- Dashboard: no subscription status, non-clickable recents, no
  onboarding.
- History: UI lacks provider filter (API supports it); silent failures
  on delete/save/download-again errors.
- Consent banner: no focus trap/`aria-modal`/Esc/initial focus.
- No `global-error.tsx`; queued jobs show indefinite spinner with no
  position/timeout note.
- `SupportedPlatforms` could advertise providers the backend has
  disabled if env enables them (UI/backend mismatch risk).
- `serverFlags.newProvider` legacy; `batchDownload` env-vs-DB dual
  truth; no public-API kill switch; no marketing blast kill switch.
- `archiver@8` heavy chain (isolated to worker, guarded); `bcryptjs`
  pure-JS (fine at this scale).
- No `manifest`, no Organization JSON-LD, global `canonical: "/"` leaks
  to auth pages (fixed by noindex).
- Referrals widget has no error state (stuck on "Loading…" on failure).

## LOW (post-launch / polish)

- `Geist_Mono` global load; duplicate `/api/account` fetches;
  `DownloadDetail` `?limit=50` over-fetch; QualitySelector chatter;
  no skip link; minor dead-code warnings (5 lint warnings, pre-existing);
  production-checklist stale Dockerfile references.

## Positive (verified, no action)

- No account enumeration (generic login/register/forgot messages +
  dummy bcrypt); sha256 single-use token storage; 24h/1d TTLs; reset
  kills sessions.
- IDOR checks on all job/file/batch/v1 detail routes (404, no oracle).
- All SQL parameterized; single `dangerouslySetInnerHTML` is escaped
  static JSON-LD; traversal guards on storage/archive/file paths.
- Pricing limits generated from `PLANS` (cannot drift); no dark
  patterns (no countdowns/scarcity/preselected purchases).
- Webhook truth (signature-verified, ledger-deduped); test-checkout
  404s in production.
- Analytics allowlist leaks no PII/URLs (24 call sites checked).
- Migrations 001–008 additive-only, `IF NOT EXISTS`; empty states
  present across dashboard/developer/growth/admin.
- No committed secrets; `.env.example` placeholders only; CI runs
  lint → typecheck → test → build → audit → doctor.
