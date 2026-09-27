import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { archiveEntryName, buildZipArchive } from "@/lib/media/archive";
import { getBatchStore, getRepository, getStorage } from "@/lib/server";
import type { JobRepository } from "@/lib/jobs/repository";
import type { ObjectStorage } from "@/lib/storage/types";

export const MAX_ARCHIVE_ITEMS = 25;

function archiveKey(batchId: string): string {
  const safe = batchId.replace(/[^A-Za-z0-9_-]/g, "");
  return `archives/${safe}.zip`;
}

function stagingRoot(): string {
  const base = env.tempDir || path.join(os.tmpdir(), "snapflow");
  return path.join(base, "archive-staging");
}

/**
 * Idempotent archive build: a valid existing archive is returned as-is.
 * Gathers completed items, stages them locally, zips with server-generated
 * names, uploads, and cleans staging even on failure.
 */
export async function buildBatchArchive(
  batchId: string,
  deps?: { repo?: JobRepository; storage?: ObjectStorage }
): Promise<{ key: string; bytes: number; count: number; reused: boolean }> {
  const repo = deps?.repo ?? getRepository();
  const storage = deps?.storage ?? getStorage();
  const batchStore = getBatchStore();
  const batch = await batchStore.getBatch(batchId);
  if (!batch) throw new AppError("VIDEO_UNAVAILABLE", "Batch not found.");
  if (batch.archiveKey && batch.archiveExpires && batch.archiveExpires > Date.now()) {
    return { key: batch.archiveKey, bytes: batch.archiveSize ?? 0, count: 0, reused: true };
  }

  const jobIds = await batchStore.getBatchJobIds(batchId);
  const staged: { name: string; path: string }[] = [];
  const stageDir = path.join(stagingRoot(), batchId);
  await fs.mkdir(stageDir, { recursive: true, mode: 0o700 });
  try {
    let idx = 0;
    for (const jid of jobIds.slice(0, MAX_ARCHIVE_ITEMS)) {
      const items = await repo.getItems(jid);
      for (const it of items) {
        if (staged.length >= MAX_ARCHIVE_ITEMS) break;
        const dest = path.join(stageDir, `in-${idx}`);
        try {
          await storage.downloadToFile(it.fileKey, dest);
        } catch {
          continue; // skip missing/expired members; ZIP lists actual count
        }
        const ext = it.container.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        staged.push({ name: archiveEntryName(idx, ext), path: dest });
        idx += 1;
      }
    }
    if (staged.length === 0) throw new AppError("VIDEO_UNAVAILABLE", "No completed files to archive.");
    const zipPath = path.join(stageDir, "batch.zip");
    const { bytes, count } = await buildZipArchive(staged, zipPath, { maxBytes: env.maxArchiveBytes });
    const key = archiveKey(batchId);
    await storage.upload({ key, contentType: "application/zip", filePath: zipPath });
    const expires = Date.now() + env.fileTtlMs;
    await batchStore.updateBatch(batchId, {
      archiveKey: key, archiveSize: bytes, archiveExpires: expires,
    });
    log(batchId, "archive built", { bytes, count });
    const { inc } = await import("@/lib/metrics");
    inc("archives_built_total");
    return { key, bytes, count, reused: false };
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Archive expiry is enforced at serve time (410 + object deletion). */
