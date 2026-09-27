import { env } from "@/lib/config/env";
import { getRepository } from "@/lib/server";

/**
 * Queue-flooding guard. When pending work exceeds MAX_QUEUE_SIZE the API
 * returns 503 SERVICE_BUSY instead of accepting unbounded jobs.
 * BullMQ counts waiting+delayed+active; local driver counts non-terminal rows.
 */
export async function pendingDepth(): Promise<number> {
  if (env.queueDriver === "bullmq" && env.redisUrl) {
    const { depthQueueFor } = await import("@/lib/queue/bullmq");
    // Shared process-lifetime handle: no per-request connect/close.
    const c = await depthQueueFor(env.redisUrl).getJobCounts("waiting", "delayed", "active");
    return (c.waiting ?? 0) + (c.delayed ?? 0) + (c.active ?? 0);
  }
  return getRepository().countActive();
}

export function queueFull(depth: number): boolean {
  return depth >= env.maxQueueSize;
}
