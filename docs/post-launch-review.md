# Post-Launch Review — SnapFlow

Template. Fill after the first day and first week of production
traffic, from logs, analytics, metrics, and user reports. Do not
invent numbers — every figure needs a source.

## First day (date: ____)

- Traffic: requests, new users, guests vs authenticated (source: metrics + DB).
- Funnel: page_view → paste → job_created → completed → registered →
  checkout_started → activated (source: analytics; client is
  consent-gated — note the coverage gap vs server counts).
- Reliability: success rate, top error codes, queue wait p50/p95,
  worker restarts, pool saturation peaks.
- Providers: per-provider success/failure, p50/p95 processing time.
- Billing: checkouts, activations, PAST_DUE, webhook failures/duplicates.
- Cost: worker hours, egress GB, storage peak vs `docs/cost-model.md`.
- Incidents: SEV log with detection → recovery → follow-ups.

## First week (date: ____)

- Retention D1/D7 of launch cohort (source: DB per `docs/product-metrics.md`).
- Activation rate + time-to-activation percentiles.
- Conversion: free → premium; onboarding skip/complete split.
- Top user complaints → issue list with BLOCKER / NON-BLOCKER /
  POST-LAUNCH triage (see launch-blocker policy in final report).

## Decisions

- What to scale (workers? pool? bandwidth?) with the measured trigger.
- What to fix next, ordered by user impact — not by opinion.
- What to delete (flags, code paths, docs) that launch proved useless.
