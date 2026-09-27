import os from "node:os";
import { env } from "@/lib/config/env";
import { appVersion, buildInfo } from "@/lib/config/validate";

export interface WorkerBeat {
  workerId: string;
  version: string;
  startedAt: number;
  lastBeat: number;
  activeJobs: number;
  capacity: number;
}

function workerId(): string {
  return `${os.hostname()}:${process.pid}`;
}

const startedAt = Date.now();
let activeJobs = 0;

export function setActiveJobs(n: number): void {
  activeJobs = n;
}

/** Publish liveness heartbeat (Redis with TTL in bullmq mode, in-process otherwise). */
export async function beatHeartbeat(): Promise<void> {
  const beat: WorkerBeat = {
    workerId: workerId(),
    version: appVersion().version,
    startedAt,
    lastBeat: Date.now(),
    activeJobs,
    capacity: env.workerConcurrency,
  };
  if (env.queueDriver === "bullmq" && env.redisUrl) {
    try {
      const { getRedisConnection } = await import("@/lib/queue/redis");
      await getRedisConnection(env.redisUrl).set(
        `worker:heartbeat:${beat.workerId}`,
        JSON.stringify(beat),
        "EX",
        90
      );
    } catch {
      // heartbeat failures must never crash the worker
    }
  } else {
    localBeats.set(beat.workerId, beat);
  }
}

const localBeats = new Map<string, WorkerBeat>();

/** Read heartbeats younger than maxAgeMs (default 90s). */
export async function readHeartbeats(maxAgeMs = 90_000): Promise<WorkerBeat[]> {
  const now = Date.now();
  if (env.queueDriver === "bullmq" && env.redisUrl) {
    try {
      const { getRedisConnection } = await import("@/lib/queue/redis");
      const r = getRedisConnection(env.redisUrl);
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, found] = (await r.scan(cursor, "MATCH", "worker:heartbeat:*", "COUNT", 100)) as [string, string[]];
        cursor = next;
        keys.push(...found);
      } while (cursor !== "0");
      if (keys.length === 0) return [];
      const raw = await r.mget(...keys);
      const out: WorkerBeat[] = [];
      for (const v of raw) {
        if (!v) continue;
        try {
          const b = JSON.parse(String(v)) as WorkerBeat;
          if (now - b.lastBeat < maxAgeMs) out.push(b);
        } catch {
          // ignore corrupt entries
        }
      }
      return out;
    } catch {
      return [];
    }
  }
  return [...localBeats.values()].filter((b) => now - b.lastBeat < maxAgeMs);
}

export function beatInfo(): { version: string; commit: string | null; buildTime: string | null } {
  const v = appVersion();
  const b = buildInfo();
  return { version: v.version, commit: b.commit, buildTime: b.buildTime };
}
