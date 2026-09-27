import { getRedisConnection } from "@/lib/queue/redis";
import type { RateLimiter, RateLimitResult } from "@/lib/rate-limit";

export interface AsyncRateLimiter {
  checkAsync(key: string): Promise<RateLimitResult>;
}

/**
 * Atomic limiter (INCR + PEXPIRE on first hit via Lua) so limits hold
 * across web instances. Fail-open with availability priority if Redis is
 * unreachable — documented in docs/runbook.md.
 */
const LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c
`;

export function createRedisRateLimiter(
  redisUrl: string,
  namespace: string,
  maxRequests: number,
  windowMs: number
): AsyncRateLimiter {
  return {
    async checkAsync(key: string): Promise<RateLimitResult> {
      try {
        const r = getRedisConnection(redisUrl);
        const full = `${namespace}:${key}`;
        const count = (await r.eval(LUA, 1, full, windowMs)) as number;
        if (count > maxRequests) {
          const ttl = await r.pttl(full);
          return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, ttl) };
        }
        return { allowed: true, remaining: Math.max(0, maxRequests - count), retryAfterMs: 0 };
      } catch {
        return { allowed: true, remaining: maxRequests, retryAfterMs: 0 };
      }
    },
  };
}

/** Uniform call site for sync (memory) and async (Redis) limiters. */
export async function checkLimit(
  limiter: RateLimiter | AsyncRateLimiter,
  key: string
): Promise<RateLimitResult> {
  if ("checkAsync" in limiter) return limiter.checkAsync(key);
  return (limiter as RateLimiter).check(key);
}
