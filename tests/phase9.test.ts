import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
}));

import {
  audioExtractArgs,
  normalizeFormats,
  parseFormatRequest,
  videoFormatSelector,
} from "@/lib/media/formats";
import { archiveEntryName, buildZipArchive } from "@/lib/media/archive";
import { deriveStatus } from "@/lib/batches/progress";
import { getMemoryBatchStore } from "@/lib/batches/memory";
import { MemoryJobRepository } from "@/lib/jobs/memory";
import { getRepository, __resetServerWiring } from "@/lib/server";
import { processDownload } from "@/worker/pipeline";
import { POST as batchPOST } from "@/app/api/batch/route";
import { GET as batchGET } from "@/app/api/batch/[id]/route";
import { POST as batchActionPOST } from "@/app/api/batch/[id]/[action]/route";
import { POST as archivePOST } from "@/app/api/batch/[id]/archive/route";
import { fakeStorage } from "./helpers";

function batchReq(body: unknown, ip = "10.20.30.40"): Request {
  return new Request("http://x/api/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const TIKTOK = "https://www.tiktok.com/@u/video/1234567890123456789";

describe("phase 9: formats", () => {
  it("parses height requests in range, rejects anything else", () => {
    expect(parseFormatRequest(undefined)).toEqual({ kind: "auto" });
    expect(parseFormatRequest({})).toEqual({ kind: "auto" });
    expect(parseFormatRequest({ kind: "audio" })).toEqual({ kind: "audio" });
    expect(parseFormatRequest({ kind: "video", maxHeight: 720 })).toEqual({ kind: "video", maxHeight: 720 });
    // Real inspected heights (portrait buckets, odd sizes) are accepted;
    // the yt-dlp selector clamps to what TikTok serves.
    expect(parseFormatRequest({ kind: "video", maxHeight: 1920 })).toEqual({ kind: "video", maxHeight: 1920 });
    expect(parseFormatRequest({ kind: "video", maxHeight: 576 })).toEqual({ kind: "video", maxHeight: 576 });
    for (const bad of [
      { kind: "video", maxHeight: 100 },
      { kind: "video", maxHeight: 5000 },
      { kind: "video", maxHeight: 720.5 },
      { kind: "video", maxHeight: "1080p" },
      { kind: "raw", format: "bestvideo" },
      { options: ["--exec", "rm"] },
      "1080p",
      { kind: "video" },
    ]) {
      expect(() => parseFormatRequest(bad)).toThrow();
    }
  });

  it("normalizes real yt-dlp format lists (dedupe, audio only when present)", () => {
    const raw = {
      formats: [
        { format_id: "a", ext: "mp4", vcodec: "h264", acodec: "aac", height: 720, filesize: 100 },
        { format_id: "b", ext: "mp4", vcodec: "h264", acodec: "aac", height: 720, filesize: 200 },
        { format_id: "c", ext: "mp4", vcodec: "h264", acodec: "aac", height: 360 },
        { format_id: "d", ext: "m4a", vcodec: "none", acodec: "mp4a", tbr: 128 },
        { format_id: "e", ext: "mp4", vcodec: "none", acodec: "none" },
      ],
    };
    const out = normalizeFormats(raw);
    expect(out.map((f) => f.id)).toEqual(["video-360p", "video-720p", "audio"]);
    expect(out.find((f) => f.id === "video-720p")?.filesize).toBe(200);
    expect(out.find((f) => f.id === "audio")?.extension).toBe("mp3");
    expect(normalizeFormats({})).toEqual([]);
    expect(normalizeFormats({ formats: [{ ext: "mp4", vcodec: "h264", height: 2160 }] })).toHaveLength(1);
  });

  it("merges portrait and landscape variants into one short-side bucket", () => {
    const out = normalizeFormats({
      formats: [
        { format_id: "p", ext: "mp4", vcodec: "h264", acodec: "aac", width: 1080, height: 1920, filesize: 500 },
        { format_id: "l", ext: "mp4", vcodec: "h264", acodec: "aac", width: 1920, height: 1080, filesize: 800 },
        { format_id: "s", ext: "mp4", vcodec: "h264", acodec: "aac", width: 720, height: 1280, filesize: 300 },
      ],
    });
    // One 1080p button (not two) and one 720p — no duplicate labels.
    expect(out.map((f) => f.id)).toEqual(["video-720p", "video-1080p"]);
    expect(out.find((f) => f.id === "video-1080p")?.filesize).toBe(800);
  });

  it("builds fixed server-side selectors (no user input inside)", () => {
    expect(videoFormatSelector(720)).toBe("bv*[height<=720]+ba/b[height<=720]/b");
    expect(videoFormatSelector(99999)).toContain("height<=1080");
    expect(audioExtractArgs()).toEqual(["-x", "--audio-format", "mp3", "--audio-quality", "0"]);
  });
});

describe("phase 9: batch API", () => {
  beforeEach(() => {
    __resetServerWiring();
  });

  it("rejects oversized batches and validates each URL", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://www.tiktok.com/@u/video/${1000000000000000000 + i}`);
    const r1 = await batchPOST(batchReq({ urls: many }, "10.0.0.101"));
    expect(r1.status).toBe(429); // over guest plan limit (2)
    const r2 = await batchPOST(batchReq({ urls: ["not a url", "https://example.com/x"] }, "10.0.0.102"));
    expect(r2.status).toBe(400);
    const b2 = (await r2.json()) as { itemErrors?: unknown[] };
    expect(b2.itemErrors).toHaveLength(2);
  });

  it("creates jobs per valid URL, skips bad ones individually", async () => {
    const res = await batchPOST(
      batchReq({ urls: [TIKTOK, "not a url"] }, "10.0.0.103")
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      data: { batchId: string; jobIds: string[]; itemErrors?: { url: string }[] };
    };
    expect(body.data.jobIds).toHaveLength(1);
    expect(body.data.itemErrors).toHaveLength(1);
    const progress = await batchGET(new Request("http://x/"), {
      params: Promise.resolve({ id: body.data.batchId }),
    });
    expect(progress.status).toBe(200);
    const p = (await progress.json()) as { data: { total: number; status: string } };
    expect(p.data.total).toBe(1);
  });

  it("guest batch limit is enforced server-side", async () => {
    const urls = [0, 1, 2].map((i) => `https://www.tiktok.com/@u/video/${2000000000000000000 + i}`);
    const r = await batchPOST(batchReq({ urls }, "10.0.0.104"));
    expect(r.status).toBe(429);
  });

  it("unknown batches 404; cancel is owner-consistent", async () => {
    const res = await batchPOST(batchReq({ urls: [TIKTOK] }, "10.0.0.105"));
    const { batchId } = ((await res.json()) as { data: { batchId: string } }).data;
    const other = await batchGET(new Request("http://x/"), { params: Promise.resolve({ id: batchId }) });
    // Guest batches are capability-URL resources (same model as guest jobs).
    expect(other.status).toBe(200);
    const bad = await batchGET(new Request("http://x/"), { params: Promise.resolve({ id: "bat_nope1234" }) });
    expect(bad.status).toBe(404);
    const cancel = await batchActionPOST(new Request("http://x/"), { params: Promise.resolve({ id: batchId, action: "cancel" }) });
    expect(cancel.status).toBe(200);
    const again = await batchActionPOST(new Request("http://x/"), { params: Promise.resolve({ id: "bat_nope1234", action: "retry" }) });
    expect(again.status).toBe(404);
  });
});

describe("phase 9: progress, cancel, retry", () => {
  it("derives batch status without stored counters", () => {
    expect(deriveStatus({ total: 0, completed: 0, failed: 0, canceled: 0, active: 0 })).toBe("QUEUED");
    expect(deriveStatus({ total: 3, completed: 0, failed: 0, canceled: 0, active: 3 })).toBe("QUEUED");
    expect(deriveStatus({ total: 3, completed: 1, failed: 0, canceled: 0, active: 2 })).toBe("PROCESSING");
    expect(deriveStatus({ total: 3, completed: 3, failed: 0, canceled: 0, active: 0 })).toBe("COMPLETED");
    expect(deriveStatus({ total: 3, completed: 0, failed: 3, canceled: 0, active: 0 })).toBe("FAILED");
    expect(deriveStatus({ total: 10, completed: 8, failed: 2, canceled: 0, active: 0 })).toBe("PARTIALLY_COMPLETED");
    expect(deriveStatus({ total: 2, completed: 0, failed: 0, canceled: 2, active: 0 })).toBe("CANCELED");
  });

  it("pipeline skips CANCELED jobs without downloading", async () => {
    const repo = new MemoryJobRepository();
    const now = Date.now();
    await repo.create({
      id: "cancel-skip-01", status: "CANCELED", provider: "tiktok",
      sourceUrl: TIKTOK, attempts: 0, createdAt: now, expiresAt: now + 60000,
    });
    let calls = 0;
    await processDownload("cancel-skip-01", {
      repo,
      storage: fakeStorage(),
      fileTtlMs: 30_000,
      download: async () => {
        calls += 1;
        return { filesize: 1 };
      },
    });
    expect(calls).toBe(0);
  });
});

describe("phase 9: zip", () => {
  it("generates server-side names and rejects traversal", () => {
    expect(archiveEntryName(0, "mp4")).toBe("media-001.mp4");
    expect(archiveEntryName(9, "MP3")).toBe("media-010.mp3");
    expect(archiveEntryName(0, "../../etc")).toBe("media-001.etc"); // dots/slashes stripped: single safe segment
  });

  it("builds zips from fixtures and enforces caps", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "snapflow-zip-"));
    const a = path.join(dir, "a.mp4");
    const b = path.join(dir, "b.mp4");
    await fs.writeFile(a, "AAA");
    await fs.writeFile(b, "BBBB");
    const dest = path.join(dir, "out.zip");
    const r = await buildZipArchive(
      [
        { name: "media-001.mp4", path: a },
        { name: "media-002.mp4", path: b },
      ],
      dest,
      { maxBytes: 1024 * 1024 }
    );
    expect(r.count).toBe(2);
    expect(r.bytes).toBeGreaterThan(0);
    await expect(
      buildZipArchive([{ name: "../evil.mp4", path: a }], path.join(dir, "x.zip"), { maxBytes: 1024 })
    ).rejects.toThrow();
    await expect(
      buildZipArchive([{ name: "media-001.mp4", path: a }], path.join(dir, "y.zip"), { maxBytes: 1 })
    ).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("archive flow zips completed items and is idempotent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "snapflow-arch-"));
    const f1 = path.join(dir, "v1.mp4");
    await fs.writeFile(f1, "DATA-1");
    const storage = fakeStorage() as ReturnType<typeof fakeStorage> & { files: Map<string, string> };
    const files = new Map<string, string>();
    (storage as unknown as { storeFile: (k: string, p: string) => void }).storeFile = (k, p) => void files.set(k, p);
    storage.downloadToFile = async (key: string, dest: string) => {
      const src = files.get(key);
      if (!src) throw new Error("missing");
      await fs.copyFile(src, dest);
    };
    const { MemoryBatchStore } = await import("@/lib/batches/memory");
    void MemoryBatchStore;
    const batchStore = getMemoryBatchStore();
    const repo = getRepository() as MemoryJobRepository;
    const now = Date.now();
    await repo.create({
      id: "arch-job-01", status: "COMPLETED", provider: "tiktok", sourceUrl: TIKTOK,
      attempts: 1, createdAt: now, expiresAt: now + 60000,
    });
    await repo.saveItems("arch-job-01", [
      {
        id: "arch-job-01-video", jobId: "arch-job-01", type: "VIDEO", format: "MP4",
        container: "mp4", fileKey: "downloads/arch-job-01/video.mp4", fileSize: 6, expiresAt: now + 60000,
      },
    ]);
    files.set("downloads/arch-job-01/video.mp4", f1);
    await batchStore.createBatch({
      id: "bat_archtest01", status: "QUEUED", formatKind: "auto", createdAt: now,
    });
    await batchStore.addItems("bat_archtest01", ["arch-job-01"]);
    const { buildBatchArchive: build } = await import("@/worker/archive");
    const first = await build("bat_archtest01", { repo, storage });
    expect(first.reused).toBe(false);
    expect(first.count).toBe(1);
    expect(storage.uploaded).toContain("archives/bat_archtest01.zip");
    const second = await build("bat_archtest01", { repo, storage });
    expect(second.reused).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("archive requires completed items", async () => {
    const batchStore = getMemoryBatchStore();
    const now = Date.now();
    await batchStore.createBatch({ id: "bat_emptyarch", status: "QUEUED", formatKind: "auto", createdAt: now });
    const res = await archivePOST(new Request("http://x/"), { params: Promise.resolve({ id: "bat_emptyarch" }) });
    expect(res.status).toBe(400);
  });

  it("migration 005 adds batch/saved tables and job format columns", async () => {
    const sql = await fs.readFile(path.join(repoRoot, "db", "migrations", "005_batch.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS batch_jobs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS batch_items");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS saved_downloads");
    expect(sql).toContain("format_kind");
    expect(sql).toContain("ON DELETE CASCADE");
  });
});

describe("phase 9: history & saved", () => {
  it("save/unsave round-trips per user", async () => {
    const { MemoryAccountStore } = await import("@/lib/accounts/memory");
    const store = new MemoryAccountStore();
    await store.saveJob("u1", "j1");
    await store.saveJob("u1", "j1");
    expect(await store.listSavedIds("u1")).toEqual(["j1"]);
    expect(await store.listSavedIds("u2")).toEqual([]);
    await store.unsaveJob("u1", "j1");
    expect(await store.listSavedIds("u1")).toEqual([]);
  });
});
