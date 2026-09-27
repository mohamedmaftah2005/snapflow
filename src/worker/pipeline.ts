import { log } from "@/lib/logger";
import type { JobRepository } from "@/lib/jobs/repository";
import type { DownloadItemRecord } from "@/lib/jobs/types";
import { buildObjectKey, type ObjectStorage } from "@/lib/storage/types";
import { cleanupJobDir, outputPath } from "@/services/downloader/TikTokDownloader";
import { getProviderRegistry } from "@/lib/providers/registry";
import type { ProviderResult } from "@/lib/providers/types";
import { AppError } from "@/lib/errors";

/** Permanent failures: retrying is pointless or abusive. */
const NON_RETRYABLE = new Set([
  "INVALID_URL",
  "UNSUPPORTED_URL",
  "BAD_REQUEST",
  "PRIVATE_CONTENT",
  "VIDEO_UNAVAILABLE",
  "GEO_RESTRICTED",
  "FILE_TOO_LARGE",
]);

export function isRetryableCode(code: string): boolean {
  return !NON_RETRYABLE.has(code);
}

export interface PipelineDeps {
  repo: JobRepository;
  storage: ObjectStorage;
  fileTtlMs: number;
  /**
   * Test hook (legacy shape): produces a single VIDEO item from the job's
   * standard output path. Real execution always goes through the registry.
   */
  download?: (url: string, jobId: string) => Promise<{
    title?: string;
    thumbnail?: string;
    duration?: number;
    filesize?: number;
  }>;
}

function codeOf(err: unknown): string {
  return err instanceof AppError ? err.code : "PROCESSING_FAILED";
}

function contentTypeFor(container: string): string {
  switch (container.toLowerCase()) {
    case "mp4":
    case "mov":
    case "webm":
      return "video/mp4";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

function failUnrecoverable(code: string, message: string): never {
  const err = new Error(message);
  (err as { code?: string }).code = code;
  (err as { unrecoverable?: boolean }).unrecoverable = true;
  throw err;
}

/**
 * Idempotent single-job processor. Platform-agnostic: the provider comes
 * from the registry, never from branching logic. Safe to re-run after a crash:
 * - COMPLETED jobs are skipped (no duplicate download/upload)
 * - stale tmp dirs are removed before starting
 * - tmp is always cleaned, success or failure
 */
export async function processDownload(jobId: string, deps: PipelineDeps): Promise<void> {
  const { repo, storage, fileTtlMs } = deps;
  const started = Date.now();

  const job = await repo.get(jobId);
  if (!job) {
    log(jobId, "job missing, skipping");
    return;
  }
  if (job.status === "COMPLETED") {
    log(jobId, "already completed, skipping (idempotent)");
    return;
  }
  if (job.status === "FAILED" || job.status === "EXPIRED" || job.status === "CANCELED") {
    log(jobId, "terminal state, skipping", { status: job.status });
    return;
  }

  // Registry is the only dispatch: unknown or disabled provider fails closed.
  const provider = getProviderRegistry().get(job.provider);
  if (!provider) {
    await repo.update(jobId, {
      status: "FAILED",
      errorCode: "UNSUPPORTED_URL",
      errorMessage: "This provider isn't supported.",
    });
    failUnrecoverable("UNSUPPORTED_URL", "Unsupported provider at execution time");
  }

  // Re-validate at execution time (the URL was validated at request time;
  // DNS/hosts may have changed since, and the queue payload is untrusted).
  try {
    provider.normalizeUrl(job.sourceUrl);
  } catch {
    await repo.update(jobId, {
      status: "FAILED",
      errorCode: "UNSUPPORTED_URL",
      errorMessage: "This link isn't supported.",
    });
    failUnrecoverable("UNSUPPORTED_URL", "Unsupported URL at execution time");
  }

  await cleanupJobDir(jobId); // clear stale partials from a previous attempt
  await repo.update(jobId, {
    status: "PROCESSING",
    startedAt: Date.now(),
    attempts: (job.attempts ?? 0) + 1,
  });
  log(jobId, "processing started", { provider: job.provider });

  try {
    let result: ProviderResult;
    if (deps.download) {
      const dl = await deps.download(job.sourceUrl, jobId);
      result = {
        provider: job.provider,
        sourceId: job.sourceUrl,
        mediaType: "VIDEO",
        title: dl.title,
        thumbnail: dl.thumbnail,
        duration: dl.duration,
        items: [
          {
            itemId: "video",
            type: "VIDEO",
            format: "MP4",
            container: "mp4",
            filesize: dl.filesize,
            localPath: outputPath(jobId),
          },
        ],
      };
    } else {
      const { env } = await import("@/lib/config/env");
      const format =
        job.formatKind === "audio"
          ? { kind: "audio" as const }
          : job.formatKind === "video" && job.formatHeight
            ? { kind: "video" as const, maxHeight: job.formatHeight as number }
            : { kind: "auto" as const };
      result = await provider.download(job.sourceUrl, {
        jobId,
        timeoutMs: env.jobTimeoutMs,
        maxFileSizeBytes: job.maxFileSize ?? env.maxFileSizeBytes,
        format,
      });
    }
    if (result.items.length === 0) throw new AppError("PROCESSING_FAILED", "Empty result");

    // Cooperative cancellation: a cancel arriving mid-download stops
    // the job before upload. Tmp is cleaned by the finally block.
    const fresh = await repo.get(jobId);
    if (!fresh || fresh.status === "CANCELED" || fresh.status === "EXPIRED") {
      log(jobId, "canceled during processing, discarding result");
      return;
    }

    await repo.update(jobId, { status: "UPLOADING" });
    const now = Date.now();
    const expiresAt = now + fileTtlMs;
    const records: DownloadItemRecord[] = [];
    let totalBytes = 0;
    for (const item of result.items) {
      const key = buildObjectKey(jobId, item.itemId);
      await storage.upload({
        key,
        contentType: contentTypeFor(item.container),
        filePath: item.localPath,
      });
      totalBytes += item.filesize ?? 0;
      records.push({
        id: `${jobId}-${item.itemId}`,
        jobId,
        type: item.type,
        format: item.format,
        container: item.container,
        resolution: item.resolution,
        width: item.width,
        height: item.height,
        fileKey: key,
        fileSize: item.filesize,
        localPath: storage.kind === "local" ? item.localPath : undefined,
        expiresAt,
      });
    }
    log(jobId, "uploading done", { items: records.length, bytes: totalBytes });
    await repo.saveItems(jobId, records);

    const first = result.items[0] as ProviderResult["items"][number];
    await repo.update(jobId, {
      status: "COMPLETED",
      sourceId: result.sourceId,
      mediaType: result.mediaType,
      // First-item denormalization keeps single-item readers working.
      fileKey: records[0]?.fileKey,
      fileSize: records[0]?.fileSize,
      localPath: records[0]?.localPath,
      format: first.format,
      resolution: first.resolution,
      completedAt: now,
      expiresAt,
      title: result.title,
      thumbnail: result.thumbnail,
      duration: result.duration,
    });
    log(jobId, "download completed", {
      event: "download_completed",
      durationMs: Date.now() - started,
    });
    const { inc: mark, observe } = await import("@/lib/metrics");
    mark("jobs_completed_total");
    mark(`jobs_completed_${job.provider}_total`);
    observe("job_processing", Date.now() - started);
    // Growth side-effects (best-effort, failure-isolated).
    try {
      const { maybeQualifyReferral } = await import("@/lib/growth/referrals");
      const { downloadCompletedNotify, lifecycleEvent } = await import("@/lib/growth/lifecycle");
      const { emitTerminalEvents } = await import("@/lib/webhooks/emit");
      if (job.userId) {
        await maybeQualifyReferral(job.userId);
        const { getRepository: getRepo } = await import("@/lib/server");
        const recent = await getRepo().listByUser(job.userId, 2);
        if (recent.filter((j) => j.status === "COMPLETED").length <= 1) {
          await lifecycleEvent({ kind: "FIRST_DOWNLOAD_COMPLETED", userId: job.userId, title: result.title ?? "Media" });
        }
        await downloadCompletedNotify(job.userId, result.title ?? "Media");
      }
      await emitTerminalEvents(jobId, job.userId, "COMPLETED").catch(() => undefined);
    } catch {
      // growth must never break downloads
    }
  } catch (err) {
    const code = codeOf(err);
    const message = err instanceof Error ? err.message : "Processing failed";
    log(jobId, "download failed", { code, provider: job.provider });
    const { inc: markFail } = await import("@/lib/metrics");
    markFail("jobs_failed_total");
    markFail(`jobs_failed_${job.provider}_total`);
    if (code === "TIMEOUT") markFail("timeouts_total");
    await repo.update(jobId, { status: "FAILED", errorCode: code, errorMessage: message });
    const { emitTerminalEvents: emitFailed } = await import("@/lib/webhooks/emit");
    await emitFailed(jobId, job.userId, "FAILED").catch(() => undefined);
    // Throw retryable errors so BullMQ attempts/backoff apply; mark unrecoverable otherwise.
    if (isRetryableCode(code)) throw err;
    failUnrecoverable(code, message);
  } finally {
    if (storage.kind !== "local") {
      await cleanupJobDir(jobId);
    }
    // Local driver keeps files for GET /api/files; S3 driver removes tmp always.
  }
}
