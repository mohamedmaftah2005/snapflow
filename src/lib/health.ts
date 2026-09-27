import { env } from "@/lib/config/env";

/**
 * Deep readiness probe: can this instance safely receive traffic?
 * Cheap, bounded checks only — never yt-dlp runs or full scans.
 */
export interface Readiness {
  ready: boolean;
  checks: Record<string, string>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkReadiness(): Promise<Readiness> {
  const checks: Record<string, string> = {};
  if (env.queueDriver === "bullmq") {
    try {
      const { getRedisConnection } = await import("@/lib/queue/redis");
      const pong = await withTimeout(getRedisConnection(env.redisUrl as string).ping(), 3000);
      checks.queue = pong === "PONG" ? "ok" : "error";
    } catch {
      checks.queue = "error";
    }
  } else {
    checks.queue = "ok(local)";
  }
  try {
    const { getRepository } = await import("@/lib/server");
    await withTimeout(getRepository().countByStatus(), 3000);
    checks.db = `ok(${env.dbDriver})`;
  } catch {
    checks.db = "error";
  }
  checks.storage = `ok(${env.storageDriver})`;
  const ready = ["queue", "db", "storage"].every((k) => (checks[k] ?? "").startsWith("ok"));
  return { ready, checks };
}
