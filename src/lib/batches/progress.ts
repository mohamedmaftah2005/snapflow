import { getBatchStore } from "@/lib/server";
import { getRepository, getStorage } from "@/lib/server";
import type { BatchProgress, BatchRecord, BatchStatus } from "./types";

export function deriveStatus(counts: {
  total: number; completed: number; failed: number; canceled: number; active: number;
}): BatchStatus {
  const { total, completed, failed, canceled, active } = counts;
  if (total === 0) return "QUEUED";
  if (canceled > 0 && completed === 0 && failed === 0 && active === 0) return "CANCELED";
  if (active > 0) return completed + failed + canceled > 0 ? "PROCESSING" : "QUEUED";
  if (completed === total) return "COMPLETED";
  if (failed === total) return "FAILED";
  if (completed > 0) return "PARTIALLY_COMPLETED";
  return "FAILED";
}

export async function batchProgress(batch: BatchRecord): Promise<BatchProgress> {
  const repo = getRepository();
  const jobIds = await getBatchStore().getBatchJobIds(batch.id);
  // Single batched fetch instead of N sequential gets (N ≤ maxBatchItems).
  const found = await repo.getMany(jobIds);
  let completed = 0;
  let failed = 0;
  let canceled = 0;
  let active = 0;
  for (const j of found) {
    if (j.status === "COMPLETED") completed += 1;
    else if (j.status === "FAILED" || j.status === "EXPIRED") failed += 1;
    else if (j.status === "CANCELED") canceled += 1;
    else active += 1;
  }
  const total = jobIds.length;
  let status = deriveStatus({ total, completed, failed, canceled, active });
  // Batch-level CANCELED persists even after children drain.
  if (batch.status === "CANCELED" && (status === "COMPLETED" || status === "FAILED" || status === "PARTIALLY_COMPLETED")) {
    status = active > 0 ? "PROCESSING" : "CANCELED";
  }
  let archiveUrl: string | undefined;
  if (batch.archiveKey && batch.archiveExpires && batch.archiveExpires > Date.now()) {
    const storage = getStorage();
    archiveUrl =
      storage.kind === "s3"
        ? await storage.getSignedUrl(batch.archiveKey)
        : `/api/batch/${batch.id}/archive/download`;
  }
  return { id: batch.id, status, total, completed, failed, processing: active, canceled, archiveUrl };
}

export async function checkBatchAccess(
  batch: BatchRecord,
  viewerUserId: string | null
): Promise<boolean> {
  if (!batch.userId) return true; // guest batch: capability URL, like guest jobs
  return viewerUserId !== null && viewerUserId === batch.userId;
}
