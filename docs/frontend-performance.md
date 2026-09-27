# Frontend Performance (Phase 14)

## Baseline (audited 2026-09-27)

No client UI libraries: the browser bundle is Next + React + Tailwind
only. Pages are server shells rendering one client island each. Zero
`next/image` usage (thumbnails are never rendered). No third-party
scripts; analytics is a consent-gated no-op unless explicitly enabled.

## Changes in this phase

1. **`AdSlot` is now a server component.** It rendered `null` without
   an ad provider but still hydrated on every homepage view. Saves one
   client island on the highest-traffic page.
2. **Below-fold code splitting.** Homepage `Faq` and result
   `MediaGallery` load via `next/dynamic` — excluded from the initial
   JS bundle, fetched only when rendered.
3. **`NotificationBell` respects background tabs.** Polling pauses while
   `document.hidden` and stops permanently after 401 (signed out)
   instead of retrying with backoff forever.
4. **`compiler.removeConsole`** strips `console.*` (except error/warn)
   from production client bundles. Server logs are unaffected.

## Core Web Vitals posture

- **LCP:** hero is server-rendered text + the downloader island; no
  hero images, no webfont CDN (Google fonts via `next/font`, swap).
- **CLS:** ad slots reserve space (`min-h-[120px]`); no late-injected
  layout. Result cards render into reserved flow.
- **INP:** downloader interactions are local state + debounced format
  fetch; polling uses `setTimeout` chains, not intervals, with cleanup
  on unmount.

## Known remaining costs (documented, not yet changed)

- `/api/account` is fetched by both `AccountNav` and `Dashboard`
  (dedup candidate: React `cache()` in the server layout).
- `DownloadDetail` over-fetches `?limit=50` to derive one boolean;
  the detail endpoint should embed `saved` instead.
- `QualitySelector` fires per 600ms keystroke-pause (server caches
  10 min, so this is client chatter, not server load).
- `Geist_Mono` loads globally though rarely used.

Measure with Lighthouse lab runs on staging before touching these;
none is on the server hot path.
