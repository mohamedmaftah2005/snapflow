import { randomBytes } from "node:crypto";
import { getApiStore, getQueue } from "@/lib/server";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import type { WebhookEventName } from "@/lib/api/types";

export interface WebhookEventData {
  download_id?: string;
  batch_id?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Emit a developer webhook event: fan out to the owner's active endpoints
 * via the webhook queue (never inline in the request/worker hot path).
 */
export async function emitWebhookEvent(
  userId: string | undefined,
  type: WebhookEventName,
  data: WebhookEventData
): Promise<void> {  if (!userId) return; // guest jobs have no developer endpoints
  try {
    const endpoints = (await getApiStore().listWebhookEndpoints(userId)).filter(
      (e) => e.active && e.events.includes(type)
    );
    for (const ep of endpoints) {
      const eventId = `evt_${randomBytes(12).toString("base64url")}`;
      const q = getQueue();
      if (q.enqueueWebhook) {
        await q.enqueueWebhook({ endpointId: ep.id, eventId, type, data });
      } else {
        const { getLocalQueue } = await import("@/lib/queue/local");
        await getLocalQueue().enqueueWebhook({ endpointId: ep.id, eventId, type, data });
      }
      inc("api_webhook_queued_total");
    }
  } catch (err) {
    logger.error("webhook_emit_failed", { user: userId, type, message: String(err).slice(0, 200) });
  }
}

/**
 * Called by the pipeline on terminal job states. Emits the download event
 * and, when a parent batch newly reaches a terminal aggregate, the batch
 * event. Guests have no endpoints, so fan-out is a no-op for them.
 */
export async function emitTerminalEvents(
  jobId: string,
  userId: string | undefined,
  outcome: "COMPLETED" | "FAILED"
): Promise<void> {
  await emitWebhookEvent(
    userId,
    outcome === "COMPLETED" ? "download.completed" : "download.failed",
    { download_id: jobId, status: outcome }
  );
  if (!userId) return;
  try {
    const { getBatchStore } = await import("@/lib/server");
    const { deriveStatus } = await import("@/lib/batches/progress");
    const batchStore = getBatchStore();
    for (const batchId of await batchStore.getBatchesForJob(jobId)) {
      const jobIds = await batchStore.getBatchJobIds(batchId);
      const { getRepository } = await import("@/lib/server");
      const found = await getRepository().getMany(jobIds);
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
      if (active > 0 || jobIds.length === 0) continue;
      const status = deriveStatus({ total: jobIds.length, completed, failed, canceled, active });
      const type =
        status === "COMPLETED" ? "batch.completed"
        : status === "PARTIALLY_COMPLETED" ? "batch.partial"
        : status === "FAILED" ? "batch.failed"
        : status === "CANCELED" ? "batch.canceled"
        : null;
      if (type) {
        await emitWebhookEvent(userId, type, { batch_id: batchId, status });
      }
    }
  } catch (err) {
    logger.error("webhook_batch_fanout_failed", { job: jobId, message: String(err).slice(0, 200) });
  }
}
