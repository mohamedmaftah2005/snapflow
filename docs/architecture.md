# Architecture — SnapFlow

Single-process Next.js web app + standalone worker processes, Postgres
for state, Redis/BullMQ for coordination, S3-compatible storage for
bytes. No microservices; no Docker (systemd units in `deploy/`).

```text
Browser ──► Next.js (App Router)
  │  ├─► API routes: validate → authorize → reserve quota → persist → enqueue
  │  └─► Server components for pages; islands for downloader/dashboard/admin
  │
  ├─► PostgreSQL (source of truth: users, jobs, batches, billing, growth)
  ├─► Redis (BullMQ queues + rate limits + idempotency; never permanent store)
  └─► S3-compatible storage (media bytes; short-lived signed URLs)

Worker processes ──► consume queues ──► yt-dlp → FFmpeg → storage
  downloadQueue (concurrency WORKER_CONCURRENCY)
  archiveQueue  (concurrency ARCHIVE_CONCURRENCY, isolated)
  webhookQueue  (deliveries, bounded retries)
  growthQueue   (email outbox sends)
```

Key invariants:

- The worker decides nothing: jobs arrive already authorized with a
  fixed format request; the pipeline is idempotent (status transitions
  + jobId dedupe), so crashes re-run safely.
- Billing rows are written only by verified webhooks; the frontend
  never trusts redirects.
- Redis loss is survivable: rate limits fail open, depth guards fail
  open, jobs stay QUEUED in Postgres and re-enqueue on recovery.
- Media bytes never sit in Node memory (file → stream → storage);
  thumbnails are URL strings, never fetched.
- Analytics is a consent-gated client no-op plus best-effort worker
  side-effects; it can never break downloads.

Environments: `APP_ENV=development|staging|production` selects config;
staging and production use separate databases, Redis, buckets, Stripe
mode, and metric tokens (see `docs/environment-matrix.md` and
`docs/staging.md`).
