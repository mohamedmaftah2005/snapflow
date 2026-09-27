import type { ArchiveQueuePayload, DownloadQueuePayload, GrowthQueuePayload, JobQueue, WebhookQueuePayload } from "./types";

export type LocalHandler = (payload: DownloadQueuePayload) => Promise<void>;
export type LocalArchiveHandler = (payload: ArchiveQueuePayload) => Promise<void>;
export type LocalWebhookHandler = (payload: WebhookQueuePayload) => Promise<void>;
export type LocalGrowthHandler = (payload: GrowthQueuePayload) => Promise<void>;

/**
 * In-process driver for local dev/tests without Redis.
 * Fire-and-forget async dispatch; the web process owns execution.
 * LIMITATION (documented): a web restart kills in-flight local jobs.
 * Production must use the BullMQ driver so web/worker restart independently.
 */
export class LocalJobQueue implements JobQueue {
  readonly name = "downloadQueue(local)";
  private handler: LocalHandler | null = null;
  private archiveHandler: LocalArchiveHandler | null = null;
  private webhookHandler: LocalWebhookHandler | null = null;
  private growthHandler: LocalGrowthHandler | null = null;

  onJob(handler: LocalHandler): void {
    this.handler = handler;
  }

  onArchive(handler: LocalArchiveHandler): void {
    this.archiveHandler = handler;
  }

  onWebhook(handler: LocalWebhookHandler): void {
    this.webhookHandler = handler;
  }

  onGrowth(handler: LocalGrowthHandler): void {
    this.growthHandler = handler;
  }

  async enqueueGrowth(payload: GrowthQueuePayload): Promise<void> {
    const h = this.growthHandler;
    if (!h) return;
    void h(payload).catch((err) => {
      console.error(JSON.stringify({ event: "local_queue_error", growth: payload.email.logId, message: String(err) }));
    });
  }

  async enqueueWebhook(payload: WebhookQueuePayload): Promise<void> {
    const h = this.webhookHandler;
    if (!h) return;
    void h(payload).catch((err) => {
      console.error(JSON.stringify({ event: "local_queue_error", webhook: payload.eventId, message: String(err) }));
    });
  }

  async enqueueArchive(batchId: string): Promise<void> {
    const h = this.archiveHandler;
    if (!h) return;
    void h({ batchId }).catch((err) => {
      console.error(JSON.stringify({ event: "local_queue_error", batchId, message: String(err) }));
    });
  }

  async enqueue(payload: DownloadQueuePayload): Promise<void> {
    const h = this.handler;
    if (!h) return; // no consumer yet; job stays QUEUED until one registers
    // Don't await: API must return immediately (same contract as BullMQ).
    void h(payload).catch((err) => {
      console.error(JSON.stringify({ event: "local_queue_error", jobId: payload.jobId, message: String(err) }));
    });
  }

  async close(): Promise<void> {
    this.handler = null;
    this.archiveHandler = null;
    this.webhookHandler = null;
    this.growthHandler = null;
  }
}

let shared: LocalJobQueue | null = null;

export function getLocalQueue(): LocalJobQueue {
  if (!shared) shared = new LocalJobQueue();
  return shared;
}
