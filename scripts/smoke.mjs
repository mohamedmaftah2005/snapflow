#!/usr/bin/env node
/**
 * Public smoke test: homepage, liveness, readiness, version, providers
 * envelope, OpenAPI, robots. Safe to run against staging AND production
 * (no downloads created, no significant resources consumed).
 * Usage: node scripts/smoke.mjs [baseUrl]  (default http://localhost:3000)
 * Exit 0 = all green.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}: ${String(err && err.message ? err.message : err).slice(0, 160)}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON body: ${text.slice(0, 120)}`);
  }
}

await check("homepage loads", async () => {
  const r = await fetch(`${base}/`);
  assert(r.status === 200, `status ${r.status}`);
  const t = await r.text();
  assert(t.includes("<h1"), "missing h1");
});

await check("liveness (/api/health)", async () => {
  const r = await fetch(`${base}/api/health`);
  const b = await json(r);
  assert(r.status === 200 && b.status === "alive", `status ${r.status}`);
});

await check("readiness (/api/ready)", async () => {
  const r = await fetch(`${base}/api/ready`);
  const b = await json(r);
  assert([200, 503].includes(r.status), `status ${r.status}`);
  assert(typeof b.checks === "object", "missing checks");
  if (r.status !== 200) throw new Error(`not ready: ${JSON.stringify(b.checks)}`);
});

await check("version (/api/version, no secrets)", async () => {
  const r = await fetch(`${base}/api/version`);
  const b = await json(r);
  assert(typeof b.version === "string", "missing version");
  assert(!JSON.stringify(b).match(/SECRET|PASSWORD|PRIVATE|TOKEN/i), "secret leak?");
});

await check("providers envelope (auth-gated, no leak)", async () => {
  const r = await fetch(`${base}/api/v1/providers`);
  assert(r.status === 401, `expected 401, got ${r.status}`);
  const b = await json(r);
  assert(b.error && b.error.code === "INVALID_API_KEY", "wrong envelope");
});

await check("openapi served", async () => {
  const r = await fetch(`${base}/openapi.json`);
  const b = await json(r);
  assert(b.openapi === "3.1.0", "bad spec version");
});

await check("public status (/api/status, no secrets)", async () => {
  const r = await fetch(`${base}/api/status`);
  const b = await json(r);
  assert(r.status === 200 && typeof b.data?.maintenance === "boolean", "bad status shape");
  assert(Array.isArray(b.data?.providers), "missing providers");
  assert(!JSON.stringify(b).match(/SECRET|PASSWORD|PRIVATE|TOKEN/i), "secret leak?");
});

await check("robots allows / and blocks /api/", async () => {
  const r = await fetch(`${base}/robots.txt`);
  const t = await r.text();
  assert(t.includes("Disallow: /api/"), "missing /api/ disallow");
});

if (failures > 0) {
  console.log(`smoke: ${failures} FAILURES`);
  process.exit(1);
}
console.log("smoke: ALL GREEN");
