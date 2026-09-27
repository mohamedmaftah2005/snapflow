import { getRedisConnection } from "@/lib/queue/redis";

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidIdempotencyKey(v: string): boolean {
  return KEY_RE.test(v);
}

export interface IdempotencyStore {
  /** Returns a previously stored jobId, or undefined. */
  get(key: string): Promise<string | undefined>;
  /** Maps key → jobId with TTL. Overwrites. */
  set(key: string, jobId: string, ttlMs: number): Promise<void>;
}

class MemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, { jobId: string; exp: number }>();

  async get(key: string): Promise<string | undefined> {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.map.delete(key);
      return undefined;
    }
    return e.jobId;
  }

  async set(key: string, jobId: string, ttlMs: number): Promise<void> {
    this.map.set(key, { jobId, exp: Date.now() + ttlMs });
  }
}

class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redisUrl: string) {}

  async get(key: string): Promise<string | undefined> {
    try {
      const v = await getRedisConnection(this.redisUrl).get(`idem:${key}`);
      return v ?? undefined;
    } catch {
      return undefined; // fail-open: duplicates possible during outage, never block
    }
  }

  async set(key: string, jobId: string, ttlMs: number): Promise<void> {
    try {
      await getRedisConnection(this.redisUrl).set(`idem:${key}`, jobId, "PX", ttlMs);
    } catch {
      // ignore — best effort
    }
  }
}

export function createIdempotencyStore(redisUrl?: string): IdempotencyStore {
  return redisUrl ? new RedisIdempotencyStore(redisUrl) : new MemoryIdempotencyStore();
}

let shared: IdempotencyStore | null = null;

export function getIdempotencyStore(redisUrl?: string): IdempotencyStore {
  if (!shared) shared = createIdempotencyStore(redisUrl);
  return shared;
}

/** Test-only isolated store. */
export function createIsolatedIdempotencyStore(): IdempotencyStore {
  return new MemoryIdempotencyStore();
}
