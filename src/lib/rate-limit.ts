export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

/** In-memory sliding-window limiter. Replace with Redis in Phase 3. */
export function createMemoryRateLimiter(
  maxRequests: number,
  windowMs: number
): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      // Bounded map: prune expired keys when large so key diversity
      // (e.g. per-IP keys) cannot grow memory without bound.
      if (hits.size > 10_000) {
        for (const [k, arr] of hits) {
          if (arr.length === 0 || now - (arr[arr.length - 1] ?? 0) >= windowMs) hits.delete(k);
          if (hits.size <= 5_000) break;
        }
      }
      const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (arr.length >= maxRequests) {
        const oldest = arr[0] ?? now;
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
      }
      arr.push(now);
      hits.set(key, arr);
      return { allowed: true, remaining: maxRequests - arr.length, retryAfterMs: 0 };
    },
  };
}

let shared: RateLimiter | null = null;

export function getRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  if (!shared) shared = createMemoryRateLimiter(maxRequests, windowMs);
  return shared;
}

/** Test-only reset. */
export function __resetRateLimiter(): void {
  shared = null;
}
