import { env } from "@/lib/config/env";
import { getLocalQueue } from "@/lib/queue/local";
import { getRepository, getStorage } from "@/lib/server";
import { getSemaphore } from "@/services/downloader/concurrency";
import { log } from "@/lib/logger";
import { buildBatchArchive } from "@/worker/archive";
import { processDownload } from "@/worker/pipeline";

let registered = false;

function runSoon(jobId: string, delayMs: number): void {
  setTimeout(() => {
    const sem = getSemaphore(env.maxConcurrentDownloads);
    if (!sem.tryAcquire()) {
      runSoon(jobId, 2000); // still busy — retry without losing the job
      return;
    }
    void processDownload(jobId, {
      repo: getRepository(),
      storage: getStorage(),
      fileTtlMs: env.fileTtlMs,
    })
      .catch((err: unknown) => {
        // Background failures are already recorded on the job row by the
        // pipeline; never let them become unhandled rejections.
        log(jobId, "background processing failed", {
          message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        });
      })
      .finally(() => sem.release());
  }, delayMs);
}

/**
 * Web-process consumer for QUEUE_DRIVER=local.
 * Registers once; jobs run fire-and-forget in this process, bounded by the
 * concurrency semaphore (busy → delayed retry, never dropped).
 */
export function ensureLocalConsumer(): void {
  if (registered) return;
  if (env.queueDriver !== "local") return;
  registered = true;
  getLocalQueue().onJob(({ jobId }) => {
    runSoon(jobId, 0);
    return Promise.resolve();
  });
  getLocalQueue().onArchive(({ batchId }) => {
    // Local driver has no separate archive worker: bound archive builds by
    // the same semaphore. buildBatchArchive is idempotent, so a busy
    // re-enqueue is safe.
    const sem = getSemaphore(env.maxConcurrentDownloads);
    if (!sem.tryAcquire()) {
      setTimeout(() => {
        getLocalQueue().enqueueArchive(batchId).catch(() => undefined);
      }, 2000);
      return Promise.resolve();
    }
    return buildBatchArchive(batchId)
      .then(() => undefined)
      .catch((err: unknown) => {
        log(batchId, "background archive failed", {
          message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        });
      })
      .finally(() => sem.release());
  });
  getLocalQueue().onWebhook(async ({ endpointId, eventId, type, data }) => {
    const { deliverWebhook } = await import("@/worker/webhook-worker");
    await deliverWebhook({ endpointId, eventId, type, data }).catch((err: unknown) => {
      log(eventId, "background webhook failed", {
        message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
    });
  });
  getLocalQueue().onGrowth(async ({ email }) => {
    const { sendEmailNow } = await import("@/lib/growth/email-outbox");
    await sendEmailNow(email).catch((err: unknown) => {
      log(email.logId, "background email failed", {
        message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
    });
  });
}
