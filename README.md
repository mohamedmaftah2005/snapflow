This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

SnapFlow is a multi-provider social-media downloader SaaS: Next.js +
TypeScript, PostgreSQL, Redis/BullMQ media workers (yt-dlp + FFmpeg),
S3-compatible storage, billing, public API, and growth tooling.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Operations & Performance

- `npm run dev` / `npm run build` / `npm start` — web app.
- `npm run worker` — media worker (BullMQ; `QUEUE_DRIVER=local` for
  single-process dev). `npm run worker:healthcheck` for deploy checks.
- Apply SQL migrations in order: `psql $DATABASE_URL -f db/migrations/008_perf.sql`
  (see `db/migrations/`; latest is Phase 14 perf indexes).
- Key scaling knobs (see `.env.example`): `WORKER_CONCURRENCY`,
  `ARCHIVE_CONCURRENCY`, `MAX_QUEUE_SIZE`, `MAX_ACTIVE_JOBS_PER_USER`,
  `WORKER_LOCK_MS`, `ADMIN_STATS_TTL_MS`.
- Docs: `docs/performance-audit.md`, `docs/performance-targets.md`,
  `docs/caching.md`, `docs/worker-scaling.md`, `docs/resilience.md`,
  `docs/cost-model.md`, `docs/capacity-planning.md`,
  `docs/frontend-performance.md`.
