# Growth Engine

Referrals, affiliates, notifications, lifecycle email, campaigns, and
experiments. Analytics events flow through the existing provider in
`src/lib/analytics.ts` (consent-gated, allowlisted props); growth
server state lives behind `GrowthStore` (`src/lib/growth/types.ts`,
memory + Postgres implementations).

## Attribution

- `Attribution` (`src/components/growth/Attribution.tsx`) is mounted in
  the root layout. `?ref=` / `?aff=` query params are validated with
  `isValidAttributionCode` (`ref_` / `aff_` + 8 URL-safe chars) and stored
  as `sf_ref` / `sf_aff` cookies (30 days, `SameSite=Lax`).
- Cookies are hints, never trust: `POST /api/auth/register` re-validates
  server-side via `attributeSignup` (code must exist + be active, no
  self-referral, one relationship per referred user, owner account ACTIVE).
  Attribution failures never break registration.
- Precedence: affiliate beats referral; never both (`precedence()`).
- Windows: `REFERRAL_ATTRIBUTION_DAYS` / `AFFILIATE_ATTRIBUTION_DAYS`
  (default 30, see `src/lib/config/env.ts`).

## Referrals

- `GET /api/referrals/mine` returns the user's link plus
  pending/qualified/rewarded counts (no referred emails exposed).
- Qualification: first completed download flips PENDING → QUALIFIED
  (`maybeQualifyReferral`, called from the download pipeline); the
  transition is conditional so retries are idempotent.
- Reward: 7-day Premium trial (`REFERRAL_TRIAL_DAYS`), capped at
  `MAX_REFERRAL_REWARDS` (default 50) per referrer. The QUALIFIED →
  REWARDED transition is the claim; over-cap claims roll back.
- Kill switch: `referrals_enabled` flag (default on). Admin UI:
  `/admin/feature-flags`. User UI: `/dashboard/referrals`.

## Affiliates

- `GET/POST /api/affiliates/mine`: apply, view code/link, conversion and
  commission totals. Applications start PENDING and are approved manually.
- Attribution is recorded at signup as a pending link; commission is
  created at subscription time from billing records (billing is the source
  of truth — see `src/lib/growth/affiliates.ts`).
- Kill switch: `affiliates_enabled` flag (default on). User UI:
  `/dashboard/affiliate`.

## Notifications

- In-app only. `notify(userId, kind, …)` honors per-user preferences;
  billing (`subscription.*`, `payment.failed`) and `security.alert` bypass
  opt-outs by design.
- Endpoints: `GET /api/notifications` (includes `unread` count),
  `POST /api/notifications/read-all`, `POST /api/notifications/[id]/read`,
  `GET/PATCH /api/notifications/preferences`.
- `NotificationBell` (header, polls 30s → 120s backoff, hides when signed
  out) and `NotificationCenter` (`/dashboard/notifications`). Preferences
  UI lives in Settings (`/dashboard/settings`).
- Account deletion removes notifications + preferences
  (`deleteNotificationsForUser`, `deletePreferences`); billing records are
  retained anonymously where required.

## Lifecycle email & campaigns

- Templates/queue in `src/lib/growth/email-outbox.ts`; lifecycle triggers
  in `src/lib/growth/lifecycle.ts`; admin campaign CRUD in
  `src/lib/growth/campaigns.ts` with per-period marketing caps
  (`MAX_MARKETING_EMAILS_PER_PERIOD`).
- Admin funnel (measured state only, never invented):
  `GET /api/admin/growth`.

## Experiments

- Definitions in `src/lib/growth/experiments.ts`. Assignment is
  deterministic: `SHA-256(experimentId:subjectId)`, first two bytes
  big-endian mod 100 for the rollout bucket, third byte parity for the
  variant — the same user never flips. Unknown experiments return control.
- `hero_cta` (50% rollout) is wired to the homepage hero sub-copy via
  `ExperimentCta`, which mirrors the server rule with Web Crypto over the
  anonymous `sf_anon` id. Control/variant only.
- Safety: experiments must never touch billing correctness, auth,
  permissions, privacy controls, or legal compliance — product experience
  only.

## Analytics events (growth)

Tracked through the existing `track()` entry (flag + consent gated):

- `referral_link_copied`
- registration/download/billing events already covered by the core event
  union in `src/lib/analytics.ts`

## Limitations (honest)

- Experiment exposure is render-only; no server-side exposure/conversion
  events are persisted, so per-variant conversion rates are not computed.
  Do not claim a winner from this setup.
- The admin growth funnel scans bounded recent state (last 1000 users,
  activation over ≤200) — it is an operational sketch, not a warehouse.
