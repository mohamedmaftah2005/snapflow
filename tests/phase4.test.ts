import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { readJsonBody } from "@/lib/validation/request";
import { normalizeTikTokUrl, supportsTikTokUrl } from "@/lib/validation/tiktok";
import { getClientIp } from "@/lib/client-ip";
import { createIsolatedIdempotencyStore, isValidIdempotencyKey } from "@/lib/idempotency";
import { queueFull } from "@/lib/queue/guard";
import { MemoryJobRepository } from "@/lib/jobs/memory";
import type { DownloadJobRecord } from "@/lib/jobs/types";
import { LocalJobQueue } from "@/lib/queue/local";
import { cleanupStaleTempDirs, recoverStalledJobs } from "@/worker/cleanup";
import { __resetMetrics, inc, renderPrometheus } from "@/lib/metrics";
import { runBinary } from "@/services/downloader/ytdlp";

function req(body: string, ctype = "application/json"): Request {
  return new Request("http://x/api/download", {
    method: "POST",
    headers: { "content-type": ctype },
    body,
  });
}

function job(over: Partial<DownloadJobRecord> = {}): DownloadJobRecord {
  const now = Date.now();
  return {
    id: "phase4-test-01",
    status: "QUEUED",
    provider: "tiktok",
    sourceUrl: "https://www.tiktok.com/@u/video/1",
    attempts: 0,
    createdAt: now,
    expiresAt: now + 60_000,
    ...over,
  };
}

describe("phase 4: hardening", () => {
  it("rejects oversized request bodies before business logic", async () => {
    const big = JSON.stringify({ url: "https://www.tiktok.com/@u/video/1", pad: "x".repeat(9000) });
    await expect(readJsonBody(req(big), { maxBytes: 8192, allowedKeys: ["url"] })).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    });
  });

  it("rejects wrong content-type, malformed JSON, and unexpected fields", async () => {
    await expect(
      readJsonBody(req("{}", "text/plain"), { maxBytes: 8192, allowedKeys: ["url"] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      readJsonBody(req("{oops"), { maxBytes: 8192, allowedKeys: ["url"] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      readJsonBody(req(JSON.stringify({ url: "x", options: ["--evil"] })), { maxBytes: 8192, allowedKeys: ["url"] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // No way to smuggle yt-dlp options through the API: only "url" is allowed.
    const ok = await readJsonBody(req(JSON.stringify({ url: "https://x" })), { maxBytes: 8192, allowedKeys: ["url"] });
    expect(ok).toEqual({ url: "https://x" });
  });

  it("blocks IPv6 loopback and IPv4-mapped private addresses", () => {
    for (const u of [
      "http://[::1]/video/1",
      "http://[::]/x",
      "http://[::ffff:127.0.0.1]/x",
      "http://[::ffff:10.1.2.3]/x",
      "http://[::ffff:169.254.169.254]/latest/",
    ]) {
      expect(supportsTikTokUrl(u)).toBe(false);
      expect(() => normalizeTikTokUrl(u)).toThrowError(AppError);
    }
  });

  it("keeps shell metacharacters inert: URL stays a single argv element", async () => {
    const tricky = "https://www.tiktok.com/@u/video/1; rm -rf /";
    // Parsed as one URL string (or rejected) — never split into commands.
    const r = await runBinary(
      process.execPath,
      ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", tricky],
      { timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([tricky]);
  });

  it("idempotency keys round-trip and validate format", async () => {
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("valid_key-1234567890")).toBe(true);
    expect(isValidIdempotencyKey("bad key!")).toBe(false);
    const store = createIsolatedIdempotencyStore();
    expect(await store.get("k-12345678")).toBeUndefined();
    await store.set("k-12345678", "job-1", 60_000);
    expect(await store.get("k-12345678")).toBe("job-1");
  });

  it("queue guard trips at the configured threshold", () => {
    expect(queueFull(0)).toBe(false);
    expect(queueFull(10_000)).toBe(true);
  });

  it("recovers stalled jobs by requeueing, never completing them", async () => {
    const repo = new MemoryJobRepository();
    await repo.create(job({ status: "PROCESSING", startedAt: Date.now() - 10_000_000 }));
    const q = new LocalJobQueue();
    const seen: string[] = [];
    q.onJob(async (p) => {
      seen.push(p.jobId);
    });
    const n = await recoverStalledJobs(repo, q, { stallTimeoutMs: 150_000 });
    expect(n).toBe(1);
    expect((await repo.get("phase4-test-01"))?.status).toBe("QUEUED");
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual(["phase4-test-01"]);
  });

  it("retention purge removes only old terminal rows", async () => {
    const repo = new MemoryJobRepository();
    const old = Date.now() - 30 * 24 * 3600 * 1000;
    await repo.create(job({ id: "old-failed-1", status: "FAILED", createdAt: old, completedAt: old }));
    await repo.create(job({ id: "new-failed-1", status: "FAILED" }));
    await repo.create(job({ id: "active-1", status: "QUEUED" }));
    const n = await repo.purgeTerminal(Date.now() - 7 * 24 * 3600 * 1000, 100);
    expect(n).toBe(1);
    expect(await repo.get("old-failed-1")).toBeUndefined();
    expect(await repo.get("new-failed-1")).toBeDefined();
    expect(await repo.get("active-1")).toBeDefined();
    expect(await repo.countActive()).toBe(1);
    expect((await repo.findStalled(Date.now(), 10)).length).toBe(0);
  });

  it("stale tmp sweep removes only old job-shaped dirs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "snapflow-sweep-"));
    const oldDir = path.join(root, "oldjob01");
    const youngDir = path.join(root, "youngjob1");
    const other = path.join(root, "not-a-job!!");
    await fs.mkdir(oldDir, { recursive: true });
    await fs.mkdir(youngDir, { recursive: true });
    await fs.mkdir(other, { recursive: true });
    const ancient = new Date(Date.now() - 48 * 3600 * 1000);
    await fs.utimes(oldDir, ancient, ancient);
    const n = await cleanupStaleTempDirs(root, 24 * 3600 * 1000);
    expect(n).toBe(1);
    await expect(fs.stat(youngDir)).resolves.toBeDefined();
    await expect(fs.stat(other)).resolves.toBeDefined();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("metrics render as Prometheus counters", () => {
    __resetMetrics();
    inc("jobs_created_total", 2);
    const out = renderPrometheus();
    expect(out).toContain("snapflow_jobs_created_total 2");
  });

  it("does not trust X-Forwarded-For unless TRUST_PROXY is set", () => {
    const r = new Request("http://x/", { headers: { "x-forwarded-for": "1.2.3.4" } });
    // Default env: TRUST_PROXY=false → header ignored (spoofable).
    expect(getClientIp(r)).toBe("direct");
  });
});
