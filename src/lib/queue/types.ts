import type { JobProvider } from "@/lib/jobs/types";

/** Minimal coordination payload. Never binary data, never secrets. */
export interface DownloadQueuePayload {
  jobId: string;
  url: string;
  provider: JobProvider;
  /** BullMQ priority (1 = premium first). Local driver is FIFO. */
  priority?: number;
}

export interface JobQueue {
  readonly name: string;
  enqueue(payload: DownloadQueuePayload, opts?: { priority?: number }): Promise<void>;
  enqueueArchive?(batchId: string, priority?: number): Promise<void>;
  enqueueWebhook?(payload: WebhookQueuePayload): Promise<void>;
  enqueueGrowth?(payload: GrowthQueuePayload): Promise<void>;
  close(): Promise<void>;
}

export const DOWNLOAD_QUEUE_NAME = "downloadQueue";
export const DOWNLOAD_JOB_NAME = "process-download";
export const ARCHIVE_QUEUE_NAME = "archiveQueue";
export const ARCHIVE_JOB_NAME = "build-archive";
export const WEBHOOK_QUEUE_NAME = "webhookQueue";
export const WEBHOOK_JOB_NAME = "deliver-webhook";
export const GROWTH_QUEUE_NAME = "growthQueue";
export const GROWTH_JOB_NAME = "growth-job";

/** Minimal archive payload. The worker loads everything else from Postgres. */
export interface ArchiveQueuePayload {
  batchId: string;
}

/** Minimal webhook payload. Secrets are loaded server-side at send time. */
export interface WebhookQueuePayload {
  endpointId: string;
  eventId: string;
  type: string;
  data: Record<string, unknown>;
}

/** Growth payload: email sends and lifecycle side-effects. Idempotent by design. */
export interface GrowthQueuePayload {
  kind: "send-email";
  email: { logId: string; userId?: string; to: string; subject: string; text: string; marketing: boolean };
}
