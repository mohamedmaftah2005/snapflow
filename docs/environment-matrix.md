# Environment Matrix — SnapFlow

No values here are secrets. Actual credentials live in
`/etc/snapflow/*.env` (0600) per host, never in the repo.

| Concern | Development | Staging | Production |
|---|---|---|---|
| `APP_ENV` | development | staging | production |
| Database | local Postgres or memory (`DB_DRIVER`) | separate staging Postgres | dedicated prod Postgres + backups |
| Redis | optional (`QUEUE_DRIVER=local` default without URL) | separate staging Redis | dedicated prod Redis |
| Storage | local driver (`TEMP_DIR`) | separate staging bucket/prefix | prod bucket + lifecycle policy |
| Billing | `BILLING_PROVIDER=test` | test mode (Stripe test keys) | live keys; `TEST_WEBHOOK_SECRET` unset |
| Email | log driver (console) | log driver; no real sends | ❌ BLOCKER: wire SMTP/Resend driver first |
| Webhooks | loopback allowed only locally (`WEBHOOK_ALLOW_PRIVATE=false` elsewhere) | staging endpoints | prod endpoints; separate secrets |
| Metrics | no token needed locally | staging `METRICS_TOKEN` | unique prod `METRICS_TOKEN` |
| Analytics | `NEXT_PUBLIC_ENABLE_ANALYTICS=false` | consent banner on | consent banner on |
| Migrations | auto/adhoc | `psql` in order 001→008, verified | same, during deploy window |
| Smoke | `npm run smoke` | required before prod | post-deploy runbook |

Rules: never point dev at prod or staging databases; never reuse
`METRICS_TOKEN`, Stripe keys, or webhook secrets across environments;
`WEBHOOK_ALLOW_PRIVATE` is always false outside local dev.
