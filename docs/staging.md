# Staging environment

Staging mirrors production topology (web + worker + Postgres + Redis +
S3-compatible bucket) with isolated resources and test credentials.

## Isolation rules (hard requirements)

- Separate database, Redis DB/index, bucket, Stripe **test** keys,
  webhook endpoints, API keys, `METRICS_TOKEN`, and secrets.
- `APP_ENV=staging`, distinct `APP_URL` (e.g. `https://staging.example`).
- Staging never sends production email, production webhooks, live billing
  events, or touches production buckets — enforced by separate config, not
  by convention. Verify with `npm run doctor` before every staging deploy.
- Test billing only (`BILLING_PROVIDER=test`); the test-checkout page 404s
  in production builds.

## Data

Prefer synthetic accounts/jobs. Never copy production passwords, API keys,
private URLs, payment data, or download metadata into staging. If a
production-shaped fixture is ever needed: minimize, anonymize, document,
and delete afterwards.

## Smoke after every staging deploy

`node scripts/smoke.mjs https://staging.example` must print ALL GREEN
before promoting to production. For failure injection drills (worker kill,
Redis restart, provider outage simulation), see `docs/production-runbook.md`.
