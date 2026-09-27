import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { getMemoryRepository, type MemoryJobRepository } from "@/lib/jobs/memory";
import { PostgresJobRepository } from "@/lib/jobs/postgres";
import type { JobRepository } from "@/lib/jobs/repository";
import { BullMqJobQueue } from "@/lib/queue/bullmq";
import { getLocalQueue } from "@/lib/queue/local";
import type { JobQueue } from "@/lib/queue/types";
import { LocalObjectStorage } from "@/lib/storage/local";
import { S3ObjectStorage } from "@/lib/storage/s3";
import type { ObjectStorage } from "@/lib/storage/types";
import { createMemoryRateLimiter } from "@/lib/rate-limit";
import { createRedisRateLimiter } from "@/lib/rate-limit-redis";
import type { AsyncRateLimiter } from "@/lib/rate-limit-redis";
import type { RateLimiter } from "@/lib/rate-limit";
import { getMemoryAccountStore } from "@/lib/accounts/memory";
import { PostgresAccountStore } from "@/lib/accounts/postgres";
import type { AccountStore } from "@/lib/accounts/types";
import { getMemoryApiStore } from "@/lib/api/memory";
import { PostgresApiStore } from "@/lib/api/postgres";
import type { ApiStore } from "@/lib/api/types";
import { getMemoryGrowthStore } from "@/lib/growth/memory";
import { PostgresGrowthStore } from "@/lib/growth/postgres";
import type { GrowthStore } from "@/lib/growth/types";
import { getMemoryBatchStore } from "@/lib/batches/memory";
import { PostgresBatchStore } from "@/lib/batches/postgres";
import type { BatchStore } from "@/lib/batches/types";

/**
 * Server wiring. Web routes and the worker share these factories.
 * Drivers degrade gracefully: memory repo / local queue+storage when the
 * corresponding URL/credentials are absent (dev), real infra when present.
 */
let repo: JobRepository | null = null;
let queue: JobQueue | null = null;
let storage: ObjectStorage | null = null;
let accounts: AccountStore | null = null;
let batches: BatchStore | null = null;
let api: ApiStore | null = null;
let growth: GrowthStore | null = null;

export function getGrowthStore(): GrowthStore {
  if (!growth) {
    growth =
      env.dbDriver === "postgres" && env.databaseUrl
        ? new PostgresGrowthStore(env.databaseUrl)
        : getMemoryGrowthStore();
  }
  return growth;
}

export function getApiStore(): ApiStore {
  if (!api) {
    api =
      env.dbDriver === "postgres" && env.databaseUrl
        ? new PostgresApiStore(env.databaseUrl)
        : getMemoryApiStore();
  }
  return api;
}

export function accountsAvailable(): boolean {
  return env.dbDriver === "postgres" ? Boolean(env.databaseUrl) : true;
}

/** Account data requires a real database in production; memory in local dev. */
export function getAccountStore(): AccountStore {
  if (!accounts) {
    if (env.dbDriver === "postgres" && !env.databaseUrl) {
      throw new AppError("TEMPORARILY_UNAVAILABLE", "Accounts are temporarily unavailable.");
    }
    accounts =
      env.dbDriver === "postgres" && env.databaseUrl
        ? new PostgresAccountStore(env.databaseUrl)
        : getMemoryAccountStore();
  }
  return accounts;
}

export function getRepository(): JobRepository {
  if (!repo) {
    repo = env.dbDriver === "postgres" && env.databaseUrl
      ? new PostgresJobRepository(env.databaseUrl)
      : getMemoryRepository();
  }
  return repo;
}

export function getQueue(): JobQueue {
  if (!queue) {
    queue = env.queueDriver === "bullmq" && env.redisUrl
      ? new BullMqJobQueue(env.redisUrl)
      : getLocalQueue();
  }
  return queue;
}

export function getStorage(): ObjectStorage {
  if (!storage) {
    storage =
      env.storageDriver === "s3" && env.storageBucket && env.storageAccessKey && env.storageSecretKey
        ? new S3ObjectStorage({
            endpoint: env.storageEndpoint,
            region: env.storageRegion,
            accessKey: env.storageAccessKey,
            secretKey: env.storageSecretKey,
            bucket: env.storageBucket,
            signedUrlTtlSeconds: env.signedUrlTtlSeconds,
          })
        : new LocalObjectStorage();
  }
  return storage;
}

export function getBatchStore(): BatchStore {
  if (!batches) {
    batches =
      env.dbDriver === "postgres" && env.databaseUrl
        ? new PostgresBatchStore(env.databaseUrl)
        : getMemoryBatchStore();
  }
  return batches;
}

/** Test-only: force fresh singletons. */
export function __resetServerWiring(): void {
  repo = null;
  queue = null;
  storage = null;
  batches = null;
  api = null;
  growth = null;
  limiters = null;
}

export type { MemoryJobRepository };

// --- Per-purpose rate limiters (different budgets per endpoint class) ---
let limiters: {
  create: RateLimiter | AsyncRateLimiter;
  status: RateLimiter | AsyncRateLimiter;
  file: RateLimiter | AsyncRateLimiter;
  auth: RateLimiter | AsyncRateLimiter;
  admin: RateLimiter | AsyncRateLimiter;
  batch: RateLimiter | AsyncRateLimiter;
  api: RateLimiter | AsyncRateLimiter;
} | null = null;

export function getLimiters(): {
  create: RateLimiter | AsyncRateLimiter;
  status: RateLimiter | AsyncRateLimiter;
  file: RateLimiter | AsyncRateLimiter;
  auth: RateLimiter | AsyncRateLimiter;
  admin: RateLimiter | AsyncRateLimiter;
  batch: RateLimiter | AsyncRateLimiter;
  api: RateLimiter | AsyncRateLimiter;
} {
  if (!limiters) {
    if (env.queueDriver === "bullmq" && env.redisUrl) {
      limiters = {
        create: createRedisRateLimiter(env.redisUrl, "rl:create", env.rateLimitRequests, env.rateLimitWindowMs),
        status: createRedisRateLimiter(env.redisUrl, "rl:status", env.rateLimitStatusRequests, env.rateLimitStatusWindowMs),
        file: createRedisRateLimiter(env.redisUrl, "rl:file", env.rateLimitFileRequests, env.rateLimitFileWindowMs),
        auth: createRedisRateLimiter(env.redisUrl, "rl:auth", 10, 60_000),
        admin: createRedisRateLimiter(env.redisUrl, "rl:admin", 60, 60_000),
        batch: createRedisRateLimiter(env.redisUrl, "rl:batch", 10, 60_000),
        api: createRedisRateLimiter(env.redisUrl, "rl:apikey", env.apiRateLimitRequests, env.apiRateLimitWindowMs),
      };
    } else {
      limiters = {
        create: createMemoryRateLimiter(env.rateLimitRequests, env.rateLimitWindowMs),
        status: createMemoryRateLimiter(env.rateLimitStatusRequests, env.rateLimitStatusWindowMs),
        file: createMemoryRateLimiter(env.rateLimitFileRequests, env.rateLimitFileWindowMs),
        auth: createMemoryRateLimiter(10, 60_000),
        admin: createMemoryRateLimiter(60, 60_000),
        batch: createMemoryRateLimiter(10, 60_000),
        api: createMemoryRateLimiter(env.apiRateLimitRequests, env.apiRateLimitWindowMs),
      };
    }
  }
  return limiters;
}
