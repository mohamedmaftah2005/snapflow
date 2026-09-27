# Conversion Experiments (Phase 15)

Run on the Phase 13 framework (`assignExperiment`, deterministic
`hero_cta` precedent). Exposure stays render-only until server-side
exposure logging exists — so no winner is declared without sufficient
evidence; see `docs/product-metrics.md` for metric definitions. No
experiment may use deception, urgency fakery, or manipulate billing,
auth, privacy, or security.

Status: `hero_cta` (homepage sub-copy, 50%) is live-in-code. Below are
the next evidence-based candidates — implement after launch baseline:

## 1. Pricing batch-clarity

- Hypothesis: showing per-plan batch limits (already added to pricing
  in Phase 15) lifts batch adoption among free users.
- Audience: visitors reaching `/pricing`. Variants: control (current
  table) / variant (batch row emphasized first).
- Primary: batch creation per pricing visitor. Duration: ≥ 2 weeks or
  ≥ 500 batch creations per arm.

## 2. Onboarding checklist vs none

- Hypothesis: the dashboard checklist raises activation (first
  COMPLETED download) for new accounts.
- Audience: accounts < 7 days with zero downloads. Variants: checklist
  shown / suppressed (events already instrumented:
  `onboarding_started/skipped/completed`).
- Primary: activation rate. Guardrail: must not reduce download starts.

## 3. Checkout pending-state copy

- Hypothesis: the "payment received — activating" banner reduces
  duplicate checkout attempts and support contacts.
- Audience: users returning with `?checkout=success`. Variants:
  current banner / banner + expected-activation time.
- Primary: duplicate checkout rate within 10 minutes. Secondary:
  support contacts about billing.
