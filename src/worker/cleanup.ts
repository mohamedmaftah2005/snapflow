import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { log, logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import type { JobRepository } from "@/lib/jobs/repository";
import type { ObjectStorage } from "@/lib/storage/types";
import type { JobQueue } from "@/lib/queue/types";

/**
 * Idempotent expiry sweep: COMPLETED + past expiresAt → delete object → EXPIRED.
 * If deletion fails the job stays COMPLETED so a later sweep retries;
 * never claim deletion that didn't happen.
 */
export async function expireJobs(
  repo: JobRepository,
  storage: ObjectStorage,
  now: number,
  limit = 50
): Promise<{ expired: number; failed: number }> {
  const expired = await repo.findExpired(now, limit);
  let done = 0;
  let failed = 0;
  for (const job of expired) {
    try {
      if (job.fileKey) await storage.remove(job.fileKey);
      if (storage.kind === "local") {
        const { cleanupJobDir } = await import("@/services/downloader/TikTokDownloader");
        await cleanupJobDir(job.id);
      }
      await repo.update(job.id, { status: "EXPIRED" });
      log(job.id, "job expired");
      done += 1;
    } catch (err) {
      log(job.id, "expiry failed, will retry", { message: String(err) });
      inc("cleanup_failures_total");
      failed += 1;
    }
  }
  if (done > 0 || failed > 0) logger.info("cleanup_completed", { expired: done, failed });
  return { expired: done, failed };
}

/**
 * Crash recovery: jobs left PROCESSING/UPLOADING by a dead worker are
 * requeued (BullMQ dedupes by jobId; local driver resets to QUEUED).
 * Never marks them completed — they re-run through the idempotent pipeline.
 */
export async function recoverStalledJobs(
  repo: JobRepository,
  queue: JobQueue,
  opts: { stallTimeoutMs: number; limit?: number }
): Promise<number> {
  const stalled = await repo.findStalled(Date.now() - opts.stallTimeoutMs, opts.limit ?? 50);
  let n = 0;
  for (const job of stalled) {
    try {
      await repo.update(job.id, { status: "QUEUED" });
      await queue.enqueue({ jobId: job.id, url: job.sourceUrl, provider: job.provider });
      logger.info("job_recovered", { job: job.id });
      n += 1;
    } catch (err) {
      logger.error("job_recovery_failed", { job: job.id, message: String(err) });
      inc("cleanup_failures_total");
    }
  }
  return n;
}

/**
 * Startup orphan sweep: temp dirs older than maxAgeMs are leftovers from
 * crashed runs (active jobs are minutes old at most; default threshold 24h).
 * Never touches young directories.
 */
export async function cleanupStaleTempDirs(root?: string, maxAgeMs?: number): Promise<number> {
  const { env } = await import("@/lib/config/env");
  const dir = root ?? (env.tempDir || path.join(os.tmpdir(), "snapflow"));
  const maxAge = maxAgeMs ?? env.staleTmpMs;
  let entries: { name: string }[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name }));
  } catch {
    return 0; // nothing to clean
  }
  const now = Date.now();
  let removed = 0;
  for (const { name } of entries) {
    // Only job-id-shaped directories — never anything else.
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fs.stat(full);
      if (now - st.mtimeMs > maxAge) {
        await fs.rm(full, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // ignore individual failures
    }
  }
  if (removed > 0) logger.info("stale_tmp_cleaned", { removed });
  return removed;
}

/**
 * Retention enforcement: drop old FAILED/EXPIRED metadata so the
 * database cannot grow indefinitely. Storage objects for these states
 * are already gone (expiry sweep); this removes the rows.
 */
export async function purgeOldJobs(
  repo: JobRepository,
  opts: { retentionMs: number; limit?: number }
): Promise<number> {
  const n = await repo.purgeTerminal(Date.now() - opts.retentionMs, opts.limit ?? 100);
  if (n > 0) logger.info("retention_purged", { rows: n });
  return n;
}
