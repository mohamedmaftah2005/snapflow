#!/usr/bin/env node
/**
 * Mocked load test — zero third-party traffic.
 * Only exercises validation/rate-limit paths (invalid URLs never reach
 * yt-dlp) plus 404 status polls. Usage:
 *   node scripts/load-test.mjs [baseUrl] [requests]
 */
const base = process.argv[2] ?? "http://localhost:3000";
const N = Number(process.argv[3] ?? 50);

const lat = [];
let ok = 0;
let rejected = 0;

for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${base}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `not-a-url-${i}` }),
    });
    lat.push(performance.now() - t0);
    if (r.status === 400) ok += 1;
    else if (r.status === 429) rejected += 1;
    else console.log(`unexpected status ${r.status}`);
  } catch (e) {
    console.log(`request failed: ${String(e)}`);
  }
}
// Status-poll pressure (missing jobs → 404, no processing involved).
const pollLat = [];
for (let i = 0; i < 20; i++) {
  const t0 = performance.now();
  await fetch(`${base}/api/download/nonexistent-job-${i}`).catch(() => undefined);
  pollLat.push(performance.now() - t0);
}

const pct = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
console.log(JSON.stringify({
  requests: N, invalidRejected: ok, rateLimited: rejected,
  post_p50_ms: Math.round(pct(lat, 50)), post_p95_ms: Math.round(pct(lat, 95)),
  poll_p50_ms: Math.round(pct(pollLat, 50)), poll_p95_ms: Math.round(pct(pollLat, 95)),
}, null, 2));
