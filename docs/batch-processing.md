# SnapFlow batch processing & media workspace

## Batch lifecycle

```
POST /api/batch {urls[], format?}
  → per-URL validate (provider allowlist, no fetch) → per-item errors
  → plan batch limit (guest 2 / free 3 / premium 10, absolute 25)
  → reserve N usage units (all-or-nothing, refunded on failure)
  → batch row QUEUED + one normal DownloadJob per valid URL
  → children enqueued at deprioritized priority (single+5)
  → 202 {batchId, jobIds, itemErrors?}

GET /api/batch/:id → derived progress (no stored counters to drift)
  QUEUED → PROCESSING → COMPLETED | PARTIALLY_COMPLETED | FAILED | CANCELED
```

Status is always derived from child jobs, so it cannot desynchronize.
One bad URL never fails the batch (`itemErrors` lists skips).

## Fairness

Batch children run 5 priority points worse than singles of the same plan
(free single 10 → batch 15; premium single 1 → batch 6), so a 25-item batch
never starves one-off downloads. Worker concurrency still bounds total load.

## Quality & audio

- `POST /api/download/formats {url}` returns formats that actually exist
  (normalized from yt-dlp JSON, cached 10 min). The UI never invents 1080p.
- `POST /api/download {url, format}` accepts only
  `{kind:auto} | {kind:video,maxHeight:360|480|720|1080} | {kind:audio}`.
  The worker builds fixed yt-dlp selectors; audio uses `-x --audio-format mp3`
  via FFmpeg with server-controlled args only (FFMPEG_UNAVAILABLE if missing).
- Requested format is stored on the job row; the pipeline passes it through.

## Cancellation

`POST /api/download/:id/cancel` and batch cancel set CANCELED on pending
jobs. The pipeline cooperatively checks status before upload and discards
results (tmp cleaned). In-flight yt-dlp processes finish their current
command but nothing is uploaded or kept.

## Retry

Only FAILED jobs with retryable codes requeue (single + batch-retry).
Successes never rerun. BullMQ exponential backoff still applies.

## ZIP archives

`POST /api/batch/:id/archive` (needs ≥1 completed item) queues a
`build-archive` job on the same queue; `GET .../archive/download` serves it.
- Member names are server-generated (`media-001.mp4`, deduped) — zip-slip
  impossible; traversal names rejected.
- Caps: ≤25 files, ≤MAX_BATCH_ARCHIVE_SIZE (500 MB default); oversized
  inputs skipped, never partially zipped silently (count reported).
- No server ZIP for single downloads; client-side "download all" covers
  galleries (≤10 items / ≤500 MB, sequential browser downloads).
- Archives expire with FILE_TTL; expiry enforced at serve time (410 +
  object deletion). Staging dirs are always removed (finally block).

## Storage & cleanup

Items, archives, and tmp dirs follow the standard lifecycle: isolated
per-job dirs, cleanup on success/failure/timeout/cancel, expiry sweeps.
History deletions remove metadata rows plus live objects (best effort).

## Limits (env, plans only lower them)

FREE_BATCH_LIMIT=3, PREMIUM_BATCH_LIMIT=10, GUEST_BATCH_LIMIT=2,
MAX_BATCH_ITEMS=25, MAX_BATCH_ARCHIVE_SIZE=500MB. Batch items consume daily
download usage 1:1. Premium never bypasses absolute safety caps.

## Feature flags

`batch_downloads`, `audio_extraction`, `advanced_quality`, `zip_downloads`,
`download_cancellation`, `saved_downloads` — all enforced server-side,
togglable in `/admin/feature-flags`, audited.
