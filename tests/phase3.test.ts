import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryJobRepository } from "@/lib/jobs/memory";
import type { DownloadJobRecord } from "@/lib/jobs/types";
import { LocalJobQueue } from "@/lib/queue/local";
import { buildObjectKey, type ObjectStorage } from "@/lib/storage/types";
import { LocalObjectStorage } from "@/lib/storage/local";
import { isRetryableCode, processDownload } from "@/worker/pipeline";
import { expireJobs } from "@/worker/cleanup";
import { AppError } from "@/lib/errors";

function makeJob(over: Partial<DownloadJobRecord> = {}): DownloadJobRecord {
  const now = Date.now();
  return {
    id: "test-job-01_AB",
    status: "QUEUED",
    provider: "tiktok",
    sourceUrl: "https://www.tiktok.com/@u/video/1",
    attempts: 0,
    createdAt: now,
    expiresAt: now + 60_000,
    ...over,
  };
}

function fakeStorage(): ObjectStorage & { uploaded: string[]; removed: string[] } {
  const uploaded: string[] = [];
  const removed: string[] = [];
  return {
    kind: "fake",
    uploaded,
    removed,
    async upload(input) {
      uploaded.push(input.key);
    },
    async getSignedUrl(key) {
      return `https://storage.example/${key}?sig=short-lived`;
    },
    async remove(key) {
      removed.push(key);
    },
    async downloadToFile() {
      throw new Error("fake has no objects");
    },
  };
}

describe("phase 3: queue + worker", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("queue payload is minimal (no binary, no secrets)", async () => {
    const q = new LocalJobQueue();
    const seen: unknown[] = [];
    q.onJob(async (p) => {
      seen.push(p);
    });
    await q.enqueue({ jobId: "abc12345", url: "https://www.tiktok.com/@u/video/1", provider: "tiktok" });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0] as object).sort()).toEqual(["jobId", "provider", "url"]);
    expect(JSON.stringify(seen[0])).not.toContain("/tmp");
  });

  it("worker success → UPLOADING → COMPLETED with storage key", async () => {
    const repo = new MemoryJobRepository();
    const storage = fakeStorage();
    await repo.create(makeJob());
    await processDownload("test-job-01_AB", {
      repo,
      storage,
      fileTtlMs: 30_000,
      download: async () => ({ title: "t", filesize: 10 }),
    });
    const rec = await repo.get("test-job-01_AB");
    expect(rec?.status).toBe("COMPLETED");
    expect(rec?.fileKey).toBe("downloads/test-job-01_AB/video.mp4");
    expect(storage.uploaded).toEqual(["downloads/test-job-01_AB/video.mp4"]);
    expect((rec?.expiresAt ?? 0)).toBeGreaterThan(Date.now());
  });

  it("duplicate processing is skipped (idempotent)", async () => {
    const repo = new MemoryJobRepository();
    const storage = fakeStorage();
    await repo.create(makeJob({ status: "COMPLETED", fileKey: "downloads/x/y.mp4" }));
    let calls = 0;
    await processDownload("test-job-01_AB", {
      repo,
      storage,
      fileTtlMs: 30_000,
      download: async () => {
        calls += 1;
        return { filesize: 1 };
      },
    });
    expect(calls).toBe(0);
    expect(storage.uploaded).toEqual([]);
  });

  it("permanent failure → FAILED + unrecoverable (no retry storm)", async () => {
    const repo = new MemoryJobRepository();
    await repo.create(makeJob());
    await expect(
      processDownload("test-job-01_AB", {
        repo,
        storage: fakeStorage(),
        fileTtlMs: 30_000,
        download: async () => {
          throw new AppError("PRIVATE_CONTENT");
        },
      })
    ).rejects.toMatchObject({ unrecoverable: true });
    expect((await repo.get("test-job-01_AB"))?.status).toBe("FAILED");
    expect(isRetryableCode("PRIVATE_CONTENT")).toBe(false);
    expect(isRetryableCode("FILE_TOO_LARGE")).toBe(false);
    expect(isRetryableCode("VIDEO_UNAVAILABLE")).toBe(false);
  });

  it("transient failure → FAILED + retryable throw for BullMQ backoff", async () => {
    const repo = new MemoryJobRepository();
    await repo.create(makeJob());
    await expect(
      processDownload("test-job-01_AB", {
        repo,
        storage: fakeStorage(),
        fileTtlMs: 30_000,
        download: async () => {
          throw new AppError("TIMEOUT");
        },
      })
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect((await repo.get("test-job-01_AB"))?.status).toBe("FAILED");
    expect(isRetryableCode("TIMEOUT")).toBe(true);
  });

  it("expiry sweep deletes the object and marks EXPIRED", async () => {
    const repo = new MemoryJobRepository();
    const storage = fakeStorage();
    await repo.create(makeJob({ status: "COMPLETED", fileKey: "downloads/a/b.mp4", expiresAt: Date.now() - 1 }));
    const r = await expireJobs(repo, storage, Date.now(), 10);
    expect(r).toEqual({ expired: 1, failed: 0 });
    expect(storage.removed).toEqual(["downloads/a/b.mp4"]);
    expect((await repo.get("test-job-01_AB"))?.status).toBe("EXPIRED");
  });

  it("failed object deletion keeps COMPLETED for a later retry", async () => {
    const repo = new MemoryJobRepository();
    const storage = fakeStorage();
    storage.remove = async () => {
      throw new Error("storage down");
    };
    await repo.create(makeJob({ status: "COMPLETED", fileKey: "downloads/a/b.mp4", expiresAt: Date.now() - 1 }));
    const r = await expireJobs(repo, storage, Date.now(), 10);
    expect(r).toEqual({ expired: 0, failed: 1 });
    expect((await repo.get("test-job-01_AB"))?.status).toBe("COMPLETED");
  });

  it("storage keys are traversal-safe and signed URLs expire", async () => {
    expect(buildObjectKey("../../etc", "x")).toBe("downloads/etc/x.mp4");
    expect(buildObjectKey("job1", "a/b.mp4")).toBe("downloads/job1/abmp4.mp4");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "snapflow-test-"));
    const src = path.join(dir, "in.mp4");
    await fs.writeFile(src, "bytes");
    const local = new LocalObjectStorage(path.join(dir, "store"));
    await local.upload({ key: "downloads/job1/f1.mp4", contentType: "video/mp4", filePath: src });
    const ref = await local.getSignedUrl("downloads/job1/f1.mp4");
    expect(ref).not.toContain(dir);
    await expect(local.upload({ key: "../escape.mp4", contentType: "video/mp4", filePath: src })).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
