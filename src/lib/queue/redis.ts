import IORedis from "ioredis";

let shared: IORedis | null = null;

/** Shared Redis connection (BullMQ-compatible). Lazy, reconnects automatically. */
export function getRedisConnection(url: string): IORedis {
  if (!shared) {
    shared = new IORedis(url, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
    shared.on("error", (err) => {
      console.error(JSON.stringify({ event: "redis_error", message: String(err) }));
    });
  }
  return shared;
}

export async function closeRedisConnection(): Promise<void> {
  if (shared) {
    const c = shared;
    shared = null;
    try {
      await c.quit();
    } catch {
      // shutdown must not throw
    }
  }
}
