# Hosting SnapFlow on Vercel

Vercel runs the **web tier only** (pages + API routes). It cannot run the
media worker: serverless functions have no yt-dlp/FFmpeg binaries,
function timeouts are shorter than media jobs, and local disk is
ephemeral. Without a worker, pasted links create jobs that never
complete.

The supported split:

```text
Vercel (web + API) ──► Neon/Supabase (Postgres)
                   ──► Upstash Redis, TCP endpoint (BullMQ)
                   ──► S3-compatible bucket, e.g. Cloudflare R2 (media)

VPS / Railway / Render / Fly (one small machine)
  └─► npm run worker (yt-dlp + ffmpeg installed)
      pointed at the SAME Postgres + Redis + bucket above
```

No code changes are needed for the split: the worker already reads all
coordination from env (`QUEUE_DRIVER=bullmq`, `DATABASE_URL`,
`REDIS_URL`, `STORAGE_*`).

## Deploy the web tier

1. Push to GitHub (done: `mohamedmaftah2005/snapflow`).
2. Vercel dashboard → Add New → Project → Import the private repo
   (grant Vercel access if prompted). Framework preset: Next.js.
   No `vercel.json` is required; `npm run build` is the build command.
3. Add the environment variables below (all of them — production
   validation fails the deploy otherwise), then Deploy.
4. After deploy: `https://<your-app>.vercel.app/api/health` should
   return alive, and `/api/status` should show `maintenance: false`.
5. Run the launch smoke list in `docs/launch-runbook.md`. Job creation
   will 503/queue until the worker below is online — that is expected.

## Required Vercel env vars

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `APP_URL` | `https://<your-app>.vercel.app` (https required) |
| `NEXT_PUBLIC_SITE_URL` | same as `APP_URL` |
| `DATABASE_URL` | pooled Postgres URL (Neon pooler / Supabase pooler) |
| `DB_DRIVER` | `postgres` |
| `REDIS_URL` | Upstash **TCP** endpoint (`rediss://…`, not the REST URL — BullMQ needs the protocol) |
| `QUEUE_DRIVER` | `bullmq` |
| `STORAGE_DRIVER` | `s3` |
| `STORAGE_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY` | your bucket (private) |
| `EMAIL_DRIVER` | `smtp` (+ `SMTP_HOST/USER/PASS`, `SMTP_PORT`, `SMTP_SECURE`) |
| `API_KEY_PEPPER`, `WEBHOOK_SECRET_KEY` | long random strings (generate fresh, never reuse) |
| `STRIPE_*` | only if selling Premium (test keys on preview deploys) |

Everything else (`FILE_TTL_*`, rate limits, `WORKER_*`, feature flags)
can stay default; tune per `docs/capacity-planning.md`.

## Host the worker (required for actual downloads)

On any small VPS with Node 20+, `yt-dlp`, and `ffmpeg`:

```bash
git clone https://github.com/mohamedmaftah2005/snapflow && cd snapflow
npm ci
# copy the SAME env as Vercel (APP_URL, DATABASE_URL, REDIS_URL,
# STORAGE_*, EMAIL_*/SMTP_*, API_KEY_PEPPER, WEBHOOK_SECRET_KEY)
APP_ENV=production npm run doctor   # must print OK, not FAIL
APP_ENV=production npm run worker
```

Keep it running with the provided `deploy/systemd/snapflow-worker.service`
(or Railway/Render/Fly with start command `npm run worker`). Verify:
worker logs `worker_start`, heartbeats appear in `/admin/system`, and a
test download completes end to end.

## Limits of the Vercel tier (by design)

- No media processing on Vercel itself — jobs wait in Redis until the
  external worker picks them up. Watch queue depth in `/admin/queues`.
- Serverless + pooled Postgres: use the pooler URL, never a direct
  single-connection string.
- `GET /api/metrics` needs `METRICS_TOKEN`; analytics stays
  consent-gated; `robots.txt` already blocks `/api/`, `/admin/`,
  `/dashboard/`.
- Preview deployments share nothing automatically — point them at
  staging infra, never production (see `docs/environment-matrix.md`).
