import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { __resetProviderRegistry, getProviderRegistry } from "@/lib/providers/registry";
import { tiktokProvider } from "@/lib/providers/tiktok";
import { youtubeProvider } from "@/lib/providers/youtube";
import { MemoryJobRepository } from "@/lib/jobs/memory";
import type { DownloadJobRecord } from "@/lib/jobs/types";
import { downloadAllAllowed } from "@/components/downloader/MediaGallery";
import { buildObjectKey } from "@/lib/storage/types";
import { processDownload } from "@/worker/pipeline";
import { fakeStorage } from "./helpers";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "..");

function job(over: Partial<DownloadJobRecord> = {}): DownloadJobRecord {
  const now = Date.now();
  return {
    id: "phase6-test-01",
    status: "QUEUED",
    provider: "tiktok",
    sourceUrl: "https://www.tiktok.com/@u/video/1",
    attempts: 0,
    createdAt: now,
    expiresAt: now + 60_000,
    ...over,
  };
}

describe("phase 6: providers", () => {
  it("registry resolves TikTok and hides disabled/unknown providers", () => {
    __resetProviderRegistry();
    const reg = getProviderRegistry();
    expect(reg.resolve("https://www.tiktok.com/@u/video/1")?.id).toBe("tiktok");
    expect(reg.resolve("https://vm.tiktok.com/abc/")).toBeDefined();
    // YouTube implemented but disabled → null (no leak, no page, no UI)
    expect(reg.resolve("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(reg.get("youtube")).toBeNull();
    expect(reg.resolve("https://example.com/video/1")).toBeNull();
    expect(reg.resolve("not a url")).toBeNull();
    expect(reg.get("tiktok")?.id).toBe("tiktok");
    expect(reg.enabled().map((e) => e.provider.id)).toEqual(["tiktok"]);
  });

  it("TikTok provider keeps its validation behavior after refactor", () => {
    expect(tiktokProvider.supportsHost("vm.tiktok.com")).toBe(true);
    expect(tiktokProvider.supportsHost("youtube.com")).toBe(false);
    expect(tiktokProvider.capabilities.video).toBe(true);
    expect(tiktokProvider.capabilities.live).toBe(false);
    const n = tiktokProvider.normalizeUrl("http://www.tiktok.com/@u/video/1?x=1#frag");
    expect(n.startsWith("https://")).toBe(true);
    expect(n).not.toContain("x=1");
    expect(() => tiktokProvider.normalizeUrl("https://example.com/x")).toThrow();
  });

  it("YouTube provider validates watch/shorts links and drops tracking", () => {
    expect(youtubeProvider.supportsHost("youtu.be")).toBe(true);
    expect(youtubeProvider.supportsHost("tiktok.com")).toBe(false);
    const watch = youtubeProvider.normalizeUrl("http://www.youtube.com/watch?v=abc123XYZ_-&utm_source=x&t=30");
    expect(watch).toContain("v=abc123XYZ_-");
    expect(watch).not.toContain("utm_source");
    expect(watch.startsWith("https://")).toBe(true);
    expect(youtubeProvider.normalizeUrl("https://youtu.be/abc123XYZ_-")).toContain("youtu.be");
    expect(() => youtubeProvider.normalizeUrl("https://www.youtube.com/feed/trending")).toThrow();
    expect(() => youtubeProvider.normalizeUrl("https://www.youtube.com/watch?v=abc&evil=1&v2=x")).not.toThrow();
  });

  it("providers reject SSRF hosts without weakening the model", () => {
    for (const u of ["http://127.0.0.1/video/1", "http://[::1]/x", "file:///etc/passwd"]) {
      expect(() => tiktokProvider.normalizeUrl(u)).toThrow();
      expect(() => youtubeProvider.normalizeUrl(u)).toThrow();
    }
    // userinfo smuggling rejected by the shared layer
    expect(() => youtubeProvider.normalizeUrl("https://youtube.com@evil.test/video")).toThrow();
  });

  it("pipeline fails closed for disabled providers (no retry storm)", async () => {
    const repo = new MemoryJobRepository();
    await repo.create(job({ provider: "youtube", sourceUrl: "https://www.youtube.com/watch?v=abc123XYZ_-" }));
    await expect(
      processDownload("phase6-test-01", { repo, storage: fakeStorage(), fileTtlMs: 30_000 })
    ).rejects.toMatchObject({ unrecoverable: true });
    const rec = await repo.get("phase6-test-01");
    expect(rec?.status).toBe("FAILED");
    expect(rec?.errorCode).toBe("UNSUPPORTED_URL");
  });

  it("pipeline persists normalized items for enabled providers", async () => {
    const repo = new MemoryJobRepository();
    await repo.create(job());
    await processDownload("phase6-test-01", {
      repo,
      storage: fakeStorage(),
      fileTtlMs: 30_000,
      download: async () => ({ title: "t", filesize: 12 }),
    });
    const rec = await repo.get("phase6-test-01");
    expect(rec?.status).toBe("COMPLETED");
    expect(rec?.mediaType).toBe("VIDEO");
    const items = await repo.getItems("phase6-test-01");
    expect(items).toHaveLength(1);
    expect(items[0]?.fileKey).toBe("downloads/phase6-test-01/video.mp4");
  });

  it("storage keys are per-item and traversal-safe", () => {
    expect(buildObjectKey("job1", "video")).toBe("downloads/job1/video.mp4");
    expect(buildObjectKey("job1", "img-2")).toBe("downloads/job1/img-2.mp4");
    expect(buildObjectKey("../../e", "x")).toBe("downloads/e/x.mp4");
  });

  it("download-all caps prevent ZIP-style abuse (no server ZIP exists)", () => {
    const mk = (n: number, size = 1000, url = "https://cdn.example/f") =>
      Array.from({ length: n }, (_, i) => ({
        id: `i${i}`, label: `Item ${i}`, format: "MP4", container: "mp4", filesize: size, url: `${url}${i}`,
      }));
    expect(downloadAllAllowed(mk(1))).toBe(false); // single item → normal button
    expect(downloadAllAllowed(mk(3))).toBe(true);
    expect(downloadAllAllowed(mk(11))).toBe(false); // over item cap
    expect(downloadAllAllowed(mk(2, 400 * 1024 * 1024))).toBe(false); // over size cap
    expect(downloadAllAllowed(mk(2, 1000, "#demo"))).toBe(false); // no demo URLs
  });

  it("migration 002 extends the model without breaking 001", async () => {
    const sql = await fs.readFile(path.join(repoRoot, "db", "migrations", "002_items.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS download_items");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_id");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS media_type");
    expect(sql).toContain("ON DELETE CASCADE");
  });
});
