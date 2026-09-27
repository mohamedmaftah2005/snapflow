# SnapFlow provider architecture

All platforms share one job system, database, queue, worker, storage, result
model, and frontend. Only provider-specific behavior (domains, validation,
extraction config, normalization) lives in provider modules.

## Layout

- `src/lib/providers/types.ts` — `MediaProvider` interface, `ProviderCapabilities`,
  `MediaType`, normalized `ProviderResult` (multi-item).
- `src/lib/providers/registry.ts` — the ONLY wiring point. `resolve(url)` maps
  explicit hostname rules to an enabled provider or `null`. Never throws.
- `src/lib/providers/tiktok.ts` — TikTok (enabled). Delegates fetching to the
  proven `TikTokDownloader`; owns identity/validation/capabilities.
- `src/lib/providers/youtube.ts` — YouTube (implemented + unit-tested, DISABLED
  until live verification — see rollout below).
- `src/lib/providers/ytdlp.ts` — shared yt-dlp JSON metadata helper.
- `src/lib/providers/client.ts` — client-safe display metadata (names,
  placeholder text). Display-only; the backend registry is authoritative.
- `src/lib/validation/net.ts` — shared SSRF layer (protocol/host/IP/DNS
  guards). Providers add only their allowed domains on top.
- `src/lib/validation/tiktok.ts` — TikTok validator built on `net.ts`.

## Data flow

```
POST /api/download {url}
  → registry.resolve(url) → provider.validateUrl() (authoritative)
  → DownloadJob {provider, sourceUrl} QUEUED → BullMQ {jobId, url, provider}
  → worker: registry.get(job.provider) → provider.download()
  → ProviderResult {mediaType, items[]} → upload each item
  → download_items rows + job COMPLETED
  → GET /api/download/:jobId returns normalized multi-item media
```

The worker contains no platform branching. Unknown/disabled providers fail
closed (`UNSUPPORTED_URL`, unrecoverable — no retry storm).

## Capabilities & media types

Providers declare `ProviderCapabilities` (video/audio/images/slideshow/stories/
live). The UI renders from actual result items (`MediaGallery` for multi-item,
single card otherwise, `Download all` capped at 10 items / 500 MB via sequential
browser downloads — no server-side ZIP is ever built).

## Storage keys

`downloads/<jobId>/<itemId>.<ext>` — server-generated only. Signed URLs
(S3) or `/api/files/<jobId>?item=<itemId>` (local driver).

## Rollout policy (mandatory)

1. Implement provider module (domains, validation, extraction, normalization).
2. Unit tests: detection, validation, normalization, error mapping, SSRF cases.
3. Integration test with mocks; manual test on permitted content.
4. Staging behind `ENABLE_<ID>=false` → enable in staging only.
5. Monitor provider metrics (`jobs_created_<id>_total`, `jobs_failed_<id>_total`).
6. Production enablement: set flag, no deploy needed (env-driven).
7. Landing page (`/<id>-downloader`) ONLY after production works.

Current status: TikTok enabled; YouTube implemented but disabled
(`ENABLE_YOUTUBE=false`, no UI/page mentions it); Instagram not implemented
(login-walled content — see phase report).

## Adding a new provider (checklist)

1. Create `src/lib/providers/<id>.ts` implementing `MediaProvider`.
2. Allowed domains + sync `normalizeUrl` + async `validateUrl` (use `net.ts`).
3. Extraction via `runBinary` (argv arrays, `shell: false`) + fixed format config.
4. Normalize to `ProviderResult` (multi-item where applicable).
5. Tests: detection/validation/normalization/errors/SSRF (see `tests/phase6.test.ts`).
6. Register in `registry.ts` with content types; add `ENABLE_<ID>` env + `.env.example`.
7. Add display entry in `client.ts` ONLY when enabling UI mentions.
8. Follow the rollout policy above. Never `if (provider === ...)` outside the registry.
