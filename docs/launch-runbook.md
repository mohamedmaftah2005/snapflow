# Launch Runbook — SnapFlow

## Before launch (all must be true)

- [ ] Staging deploy green: build → migrate 001→008 → health → smoke
      (`npm run smoke`) → doctor (`APP_ENV=staging`).
- [ ] Backups verified: latest `pg_dump` restorable (see
      `docs/disaster-recovery.md`); storage lifecycle set.
- [ ] Monitoring reachable: `/api/metrics` scraped, heartbeat visible
      in `/admin/system`, alert thresholds set per `docs/monitoring.md`.
- [ ] DNS + HTTPS verified; HSTS + CSP headers present (see next.config).
- [ ] ❌ BLOCKER: production email driver wired (verify/reset/billing
      mail must actually deliver). `npm run doctor` warns until then.
- [ ] Stripe live mode configured; test-checkout 404s in production.
- [ ] `support@snapflow.app` inbox monitored; DMCA contact current.
- [ ] Pricing `$5` matches the Stripe price object.

## Launch sequence (gradual, flag-driven)

```text
Staging verification
  ↓
Production deploy (maintenance_mode ON)
  ↓
Migrate → health/ready → smoke → doctor
  ↓
maintenance_mode OFF, providers ON one at a time (tiktok first)
  ↓
Smoke: guest download → register → verify → download → history
  ↓
Monitor first hour (errors, queue depth/wait, workers, DB pool,
Redis, storage growth, success rate, payment events)
  ↓
Expanded exposure: enable batch → affiliates/referrals → API → marketing
  ↓
Full launch + first-day review (traffic, conversion, failures,
provider performance, cost, feedback → docs/post-launch-review.md)
```

## First hour / first day

Watch: error rate, queue wait > 30s sustained, worker CPU > 80%,
pool saturation > 80%, disk free < 20%, webhook backlog, PAST_DUE
spike. Kill switches (no redeploy): providers, batch, audio, zip,
`api_enabled`, `marketing_enabled`, referrals, affiliates, full
maintenance. Every flag flip is audited.

## Do not

Deploy on Fridays without on-call coverage; run load tests against
production; enable marketing before consent flows are verified;
declare victory from compile success — readiness is measured paths,
not green builds.
