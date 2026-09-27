import { Queue } from "bullmq";
import { getRedisConnection } from "./redis";
import { ARCHIVE_JOB_NAME, ARCHIVE_QUEUE_NAME, DOWNLOAD_JOB_NAME, DOWNLOAD_QUEUE_NAME, GROWTH_JOB_NAME, GROWTH_QUEUE_NAME, WEBHOOK_JOB_NAME, WEBHOOK_QUEUE_NAME, type ArchiveQueuePayload, type DownloadQueuePayload, type GrowthQueuePayload, type JobQueue, type WebhookQueuePayload } from "./types";

/**
 * Process-lifetime shared queues. Previously every enqueueWebhook /
 * enqueueGrowth / pendingDepth call built and closed a throwaway Queue
 * (TCP + handshake per request). These singletons are never closed
 * except in tests; BullMqJobQueue.close() only closes the download queue
 * it owns.
 */
let sharedWebhooks: Queue<WebhookQueuePayload> | null = null;
let sharedGrowth: Queue<GrowthQueuePayload> | null = null;
let sharedDepth: Queue | null = null;

function webhookQueueFor(redisUrl: string): Queue<WebhookQueuePayload> {
  if (!sharedWebhooks) {
    sharedWebhooks = new Queue<WebhookQueuePayload>(WEBHOOK_QUEUE_NAME, {
      connection: getRedisConnection(redisUrl),
    });
  }
  return sharedWebhooks;
}

function growthQueueFor(redisUrl: string): Queue<GrowthQueuePayload> {
  if (!sharedGrowth) {
    sharedGrowth = new Queue<GrowthQueuePayload>(GROWTH_QUEUE_NAME, {
      connection: getRedisConnection(redisUrl),
    });
  }
  return sharedGrowth;
}

/** Test-only reset for the shared queues. */
export function __resetSharedQueues(): void {
  sharedWebhooks = null;
  sharedGrowth = null;
  sharedDepth = null;
}

/** Shared handle for read-only depth probes (never closed by callers). */
export function depthQueueFor(redisUrl: string): Queue {
  if (!sharedDepth) {
    sharedDepth = new Queue(DOWNLOAD_QUEUE_NAME, { connection: getRedisConnection(redisUrl) });
  }
  return sharedDepth;
}

/** Production driver: Next.js enqueues, the worker consumes. Redis = coordination only. */
export class BullMqJobQueue implements JobQueue {
  readonly name = DOWNLOAD_QUEUE_NAME;
  private queue: Queue<DownloadQueuePayload>;
  private archives: Queue<ArchiveQueuePayload>;

  constructor(private readonly redisUrl: string) {
    this.queue = new Queue<DownloadQueuePayload>(DOWNLOAD_QUEUE_NAME, {
      connection: getRedisConnection(redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    // Archives run on their own queue + worker so a 25-file ZIP can never
    // starve the download slots (see docs/worker-scaling.md).
    this.archives = new Queue<ArchiveQueuePayload>(ARCHIVE_QUEUE_NAME, {
      connection: getRedisConnection(redisUrl),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 20,
        removeOnFail: 100,
      },
    });
  }

  async enqueue(payload: DownloadQueuePayload, opts?: { priority?: number }): Promise<void> {
    // Dedupe accidental double-clicks: BullMQ jobId = our jobId.
    await this.queue.add(DOWNLOAD_JOB_NAME, payload, {
      jobId: payload.jobId,
      priority: opts?.priority,
    });
  }

  async enqueueArchive(batchId: string, priority?: number): Promise<void> {
    await this.archives.add(
      ARCHIVE_JOB_NAME,
      { batchId },
      { jobId: `archive-${batchId}`, priority }
    );
  }

  async enqueueWebhook(payload: WebhookQueuePayload): Promise<void> {
    await webhookQueueFor(this.redisUrl).add(WEBHOOK_JOB_NAME, payload, {
      jobId: `${payload.eventId}:${payload.endpointId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
    });
  }

  async enqueueGrowth(payload: GrowthQueuePayload): Promise<void> {
    await growthQueueFor(this.redisUrl).add(GROWTH_JOB_NAME, payload, {
      jobId: `growth-${payload.email.logId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.archives.close();
  }
}
