# Incident response

## Severity

- **SEV-1**: user-facing outage or data-loss risk (web down, DB down,
  all downloads failing). Page immediately, all hands.
- **SEV-2**: degraded service (one provider failing, queue growing,
  elevated 5xx). Respond within the hour.
- **SEV-3**: isolated/minor (single feature, docs, non-urgent bug). Next
  business day.

Single failed downloads are expected (source platforms change) and are
never incidents by themselves — alert on rates, not events.

## Flow

1. **Detect** — health/readiness, `/admin/system`, metrics
   (`snapflow_jobs_failed_total` rate, queue depth, `api_webhook_failed_total`).
2. **Assess** — SEV level, blast radius, which layer (web/queue/worker/
   provider/storage/billing) via `/admin/system` + logs (requestId/jobId).
3. **Contain** — pause queue, disable degrading provider, or enable
   `maintenance_mode` (all audited, all reversible; in-flight jobs finish).
4. **Investigate** — structured logs, audit trail, provider success-rate
   history, recent deploys (`/api/version` commit).
5. **Recover** — restart/redeploy per `docs/production-runbook.md`,
   verify with smoke + readiness, then lift containment.
6. **Verify** — error rates back to baseline for 30 minutes.
7. **Document** — timeline in the incident note; link audit entries.
8. **Prevent recurrence** — follow-up task (test, alert, or limit change).

## On-call checklist

- [ ] Web alive (`/api/health`) and ready (`/api/ready`)
- [ ] v1 API envelope sane (`/api/v1/providers` without key → 401 envelope)
- [ ] Database reachable (admin system: database HEALTHY)
- [ ] Redis reachable
- [ ] Workers beating (admin system: workers HEALTHY, heartbeats < 90s)
- [ ] Queue depth below `MAX_QUEUE_SIZE`
- [ ] Storage driver reachable, cleanup failures at 0
- [ ] Provider success rates normal (7d view on admin dashboard)
- [ ] Billing webhooks processing (no FAILED backlog)
