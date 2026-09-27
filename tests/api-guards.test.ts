import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/lib/rate-limit";
import { createIsolatedStore, isValidFileId, newJobId } from "@/services/downloader/store";
import { createSemaphore } from "@/services/downloader/concurrency";

describe("api guards", () => {
  it("13. rejects invalid file IDs including traversal", () => {
    expect(isValidFileId("../../etc/passwd")).toBe(false);
    expect(isValidFileId("C:\\Windows\\x")).toBe(false);
    expect(isValidFileId("")).toBe(false);
    expect(isValidFileId("..")).toBe(false);
    const id = newJobId();
    expect(isValidFileId(id)).toBe(true);
  });

  it("12. treats past-expiry jobs as expired", () => {
    const store = createIsolatedStore();
    const id = newJobId();
    store.create({
      id,
      status: "COMPLETED",
      normalizedUrl: "https://www.tiktok.com/@u/video/1",
      createdAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1,
      filePath: "/tmp/snapflow/x/media.mp4",
    });
    const rec = store.get(id);
    expect(rec).toBeDefined();
    expect(Date.now() > (rec?.expiresAt ?? 0)).toBe(true);
  });

  it("14. rate-limits after the configured threshold", () => {
    const rl = createMemoryRateLimiter(3, 60_000);
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(true);
    const blocked = rl.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("concurrency guard rejects when at capacity", () => {
    const sem = createSemaphore(1);
    expect(sem.tryAcquire()).toBe(true);
    expect(sem.tryAcquire()).toBe(false);
    sem.release();
    expect(sem.tryAcquire()).toBe(true);
  });

  it("15. success envelope uses the typed contract", () => {
    const body = {
      success: true as const,
      data: {
        jobId: newJobId(),
        title: "t",
        expiresAt: new Date().toISOString(),
        downloads: [
          { id: "a", label: "Video · MP4", format: "MP4", container: "mp4", url: "/api/files/abc12345" },
        ],
      },
    };
    expect(body.success).toBe(true);
    expect(body.data.downloads[0]?.url.startsWith("/api/files/")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("/tmp/");
    expect(JSON.stringify(body)).not.toContain("C:\\");
  });
});
