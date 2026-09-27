import { describe, expect, it } from "vitest";
import { MemoryJobRepository } from "@/lib/jobs/memory";
import { decodeHistoryCursor, encodeHistoryCursor } from "@/lib/jobs/repository";
import type { DownloadJobRecord } from "@/lib/jobs/types";
import { queueFull } from "@/lib/queue/guard";
import { cached, __resetCache } from "@/lib/cache";
import { __resetMetrics, inc, renderPrometheus } from "@/lib/metrics";
import { createMemoryRateLimiter } from "@/lib/rate-limit";
import { MemoryGrowthStore } from "@/lib/growth/memory";
import { env } from "@/lib/config/env";

function job(id: string, userId: string, createdAt: number, status: DownloadJobRecord["status"] = "QUEUED"): DownloadJobRecord {
  return {
    id,
    status,
    provider: "tiktok",
    sourceUrl: `https://www.tiktok.com/@u/video/${id}`,
    userId,
    attempts: 0,
    createdAt,
    expiresAt: createdAt + 60_000,
  };
}

describe("phase 14: history cursor codec", () => {
  it("round-trips and rejects garbage", () => {
    const c = encodeHistoryCursor(1700000000000, "job_abc");
    expect(decodeHistoryCursor(c)).toEqual({ createdAt: 1700000000000, id: "job_abc" });
    expect(decodeHistoryCursor("!!!")).toBeNull();
    expect(decodeHistoryCursor("")).toBeNull();
    expect(decodeHistoryCursor(Buffer.from("nocolon", "utf8").toString("base64url"))).toBeNull();
  });
});

describe("phase 14: cursor pagination", () => {
  it("walks the full history with no overlap or gaps", async () => {
    const repo = new MemoryJobRepository();
    const base = Date.now();
    for (let i = 0; i < 30; i++) {
      await repo.create(job(`job_${String(i).padStart(2, "0")}`, "user_a", base + i * 1000));
    }
    await repo.create(job("other_1", "user_b", base + 999_999));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await repo.listHistoryCursor("user_a", { limit: 7, cursor });
      expect(r.jobs.length).toBeGreaterThan(0);
      // Newest-first ordering.
      for (let i = 1; i < r.jobs.length; i++) {
        expect(r.jobs[i - 1]!.createdAt).toBeGreaterThanOrEqual(r.jobs[i]!.createdAt);
      }
      seen.push(...r.jobs.map((j) => j.id));
      if (!r.nextCursor || r.jobs.length < 7) break;
      cursor = r.nextCursor;
    }
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
    expect(seen).not.toContain("other_1");
    // Same membership as the offset implementation.
    const legacy = await repo.listHistory("user_a", { limit: 50, offset: 0 });
    expect(new Set(legacy.jobs.map((j) => j.id))).toEqual(new Set(seen));
  });

  it("honors status filters and stays within budget", async () => {
    const repo = new MemoryJobRepository();
    const base = Date.now();
    for (let i = 0; i < 200; i++) {
      await repo.create(job(`j${i}`, "user_c", base + i, i % 2 === 0 ? "COMPLETED" : "FAILED"));
    }
    const t0 = Date.now();
    const r = await repo.listHistoryCursor("user_c", { status: "COMPLETED", limit: 50 });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.jobs).toHaveLength(50);
    expect(r.jobs.every((j) => j.status === "COMPLETED")).toBe(true);
    expect(r.nextCursor).not.toBeNull();
  });
});

describe("phase 14: batch fetch + per-user active count", () => {
  it("getMany returns the requested subset in one call", async () => {
    const repo = new MemoryJobRepository();
    await repo.create(job("a", "u1", 1));
    await repo.create(job("b", "u1", 2));
    await repo.create(job("c", "u1", 3));
    const found = await repo.getMany(["a", "c", "missing"]);
    expect(found.map((j) => j.id).sort()).toEqual(["a", "c"]);
    expect(await repo.getMany([])).toEqual([]);
  });

  it("countActiveByUser scopes to the owner and active states", async () => {
    const repo = new MemoryJobRepository();
    const now = Date.now();
    await repo.create(job("a1", "u1", now, "QUEUED"));
    await repo.create(job("a2", "u1", now, "PROCESSING"));
    await repo.create(job("a3", "u1", now, "COMPLETED"));
    await repo.create(job("b1", "u2", now, "QUEUED"));
    expect(await repo.countActiveByUser("u1")).toBe(2);
    expect(await repo.countActiveByUser("u2")).toBe(1);
    expect(await repo.countActiveByUser("nobody")).toBe(0);
  });

  it("queue guard trips at the configured threshold", () => {
    expect(queueFull(env.maxQueueSize - 1)).toBe(false);
    expect(queueFull(env.maxQueueSize)).toBe(true);
  });
});

describe("phase 14: aggregate cache", () => {
  it("caches, expires, and single-flights", async () => {
    __resetCache();
    let calls = 0;
    const fn = async (): Promise<number> => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 42;
    };
    const [a, b] = await Promise.all([
      cached("k", 60_000, fn),
      cached("k", 60_000, fn),
    ]);
    expect(a.value).toBe(42);
    expect(b.value).toBe(42);
    expect(b.hit).toBe(true);
    expect(calls).toBe(1); // single-flight, not stampede
    // Expiry: a fresh entry is a hit; after eviction it recomputes.
    const fresh = await cached("k", 60_000, fn);
    expect(fresh.hit).toBe(true);
    expect(calls).toBe(1);
    __resetCache();
    const recomputed = await cached("k", 60_000, fn);
    expect(recomputed.hit).toBe(false);
    expect(calls).toBe(2);
    __resetCache();
  });
});

describe("phase 14: bounded in-memory structures", () => {
  it("caps metric series cardinality", () => {
    __resetMetrics();
    for (let i = 0; i < 5100; i++) inc(`dyn_${i}_total`);
    const out = renderPrometheus();
    expect(out).toContain("snapflow_dropped_series 100");
    __resetMetrics();
  });

  it("caps the memory rate-limiter map", () => {
    const limiter = createMemoryRateLimiter(2, 60_000);
    for (let i = 0; i < 12_000; i++) limiter.check(`ip-${i}`);
    const r = limiter.check("fresh-key");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
  });
});

describe("phase 14: growth retention purges", () => {
  it("purges only rows older than the cutoff", async () => {
    const store = new MemoryGrowthStore();
    const old = Date.now() - 100 * 24 * 3600 * 1000;
    const now = Date.now();
    await store.createNotification({ id: "n-old", userId: "u", type: "t", title: "t", body: "b", createdAt: old });
    await store.createNotification({ id: "n-new", userId: "u", type: "t", title: "t", body: "b", createdAt: now });
    await store.logEmail({ id: "e-old", userId: "u", type: "t", status: "SENT", createdAt: old });
    await store.logEmail({ id: "e-new", userId: "u", type: "t", status: "SENT", createdAt: now });
    const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
    expect(await store.purgeNotifications(cutoff, 200)).toBe(1);
    expect(await store.purgeEmailLogs(cutoff, 200)).toBe(1);
    expect((await store.listNotifications("u", 10)).map((n) => n.id)).toEqual(["n-new"]);
  });
});

describe("phase 14: performance config defaults", () => {
  it("defines sane centralized knobs", () => {
    expect(env.maxActiveJobsPerUser).toBe(5);
    expect(env.archiveConcurrency).toBe(1);
    expect(env.workerLockMs).toBe(300_000);
    expect(env.dbStatementTimeoutMs).toBe(15_000);
    expect(env.dbSlowQueryMs).toBe(1_000);
    expect(env.adminStatsTtlMs).toBe(60_000);
    expect(env.notificationRetentionDays).toBe(90);
    expect(env.emailLogRetentionDays).toBe(90);
  });
});
