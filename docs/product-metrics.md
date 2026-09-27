# Product Metrics (Phase 15)

Single definitions shared by frontend, analytics, admin, billing, API,
and database. If a dashboard disagrees with this file, the dashboard
is wrong.

All timestamps UTC. Ratios are computed over the stated denominator —
never over "active users" unless specified.

## Activation

**Activated user** = account with ≥ 1 `COMPLETED` download job.

- Source of truth: `download_jobs` rows (`status = 'COMPLETED'`),
  probed via `listByUser` (admin growth funnel) and observed via
  `onboarding_completed` / `first_download_completed` analytics events.
- Consistent with the pre-existing definition: lifecycle
  `FIRST_DOWNLOAD_COMPLETED` and `docs/growth.md` activation. This
  phase documents it; it does not redefine it.
- **Activation rate** = activated users / verified new users in the
  cohort window.
- **Time to activation** = `first COMPLETED.created_at − users.createdAt`
  (percentiles p50/p75/p90; never mean-only).

## Conversion

Funnel (all events exist in `src/lib/analytics.ts` unless noted):

```text
page_view → paste_url → download_started → download_job_created →
download_completed → (register) → onboarding_completed →
first_download_completed → checkout_started → subscription active
(webhook truth, not a client event)
```

- **Premium conversion** = subscriptions activated / verified new
  users. Billing rows are authoritative; analytics only observes.
- No conversion numbers are displayed anywhere without measured data.

## Retention / churn

- **Active user (day)** = ≥ 1 download creation or completion that day.
- **Retention D1/D7/D30** = cohort users active on that day /
  cohort size. Defined; cohort tables are a post-launch build
  (admin growth currently shows funnel only).
- **Customer churn** = cancellations in period / subscriptions at
  period start. **Revenue churn** = MRR lost / MRR at period start.
  Both from billing rows, never analytics estimates.

## Downloads

- **Successful download** = job reaching `COMPLETED` (file stored,
  signed URL issued). **Failed download** = terminal `FAILED` with an
  `error_code`. `EXPIRED` means the TTL lapsed, not a failure.
- **Success rate** = COMPLETED / (COMPLETED + FAILED).

## Onboarding events

`onboarding_started` (checklist shown), `onboarding_skipped`
(dismissed), `onboarding_completed` + `first_download_completed`
(first COMPLETED job observed). Guests are out of scope for activation
metrics (no stable identity).
