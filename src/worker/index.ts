/**
 * SnapFlow media worker. No frontend code here.
 *  - bullmq mode: consumes downloadQueue from Redis, concurrency from env.
 *  - local mode:  runs the expiry sweep + heartbeat (web process does the work).
 *  --healthcheck: verify Redis/DB/binaries/storage config, exit 0/1.
 */
import { Worker, UnrecoverableError } from "bullmq";
import { env } from "@/lib/config/env";
import { getRedisConnection, closeRedisConnection } from "@/lib/queue/redis";
import { DOWNLOAD_QUEUE_NAME, ARCHIVE_QUEUE_NAME, WEBHOOK_QUEUE_NAME, GROWTH_QUEUE_NAME, type ArchiveQueuePayload, type DownloadQueuePayload, type GrowthQueuePayload, type JobQueue, type WebhookQueuePayload } from "@/lib/queue/types";
import { getRepository, getStorage } from "@/lib/server";
import { processDownload } from "@/worker/pipeline";
import { expireJobs } from "@/worker/cleanup";
import { checkBinaryAvailable, runBinary } from "@/services/downloader/ytdlp";

/** yt-dlp version is logged at startup (internal only) for provider debugging. */
async function ytDlpVersion(): Promise<string> {
  try {
    const r = await runBinary(env.ytDlpPath, ["--version"], { timeoutMs: 15_000 });
    return r.exitCode === 0 ? r.stdout.trim().slice(0, 32) : "unknown";
  } catch {
    return "unavailable";
  }
}

async function healthcheck(): Promise<void> {
  const checks: Record<string, boolean> = {};
  if (env.queueDriver === "bullmq") {
    try {
      const r = getRedisConnection(env.redisUrl ?? "");
      const pong = await r.ping();
      checks.redis = pong === "PONG";
    } catch {
      checks.redis = false;
    }
  } else {
    checks.redis = true; // not required in local mode
  }
  try {
    const repo = getRepository();
    if (env.dbDriver === "postgres" && env.databaseUrl) {
      const { PostgresJobRepository } = await import("@/lib/jobs/postgres");
      const pg = new PostgresJobRepository(env.databaseUrl);
      await pg.findExpired(Date.now(), 1);
      await pg.close();
    } else {
      await repo.findExpired(Date.now(), 1);
    }
    checks.db = true;
  } catch {
    checks.db = false;
  }
  checks.ytdlp = await checkBinaryAvailable(env.ytDlpPath);
  checks.ffmpeg = await checkBinaryAvailable(env.ffmpegPath, ["-version"]);
  const storageOk =
    env.storageDriver === "local" ||
    Boolean(env.storageBucket && env.storageAccessKey && env.storageSecretKey);
  checks.storage = storageOk;
  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ event: "worker_healthcheck", ok, checks }));
  await closeRedisConnection().catch(() => undefined);
  process.exit(ok ? 0 : 1);
}

async function main(): Promise<void> {
  if (process.argv.includes("--healthcheck")) {
    await healthcheck();
    return;
  }

  // Fail fast on missing required config (don't die mid-download later).
  if (env.queueDriver === "bullmq" && !env.redisUrl) {
    throw new Error("QUEUE_DRIVER=bullmq requires REDIS_URL");
  }
  if (env.dbDriver === "postgres" && !env.databaseUrl) {
    throw new Error("DB_DRIVER=postgres requires DATABASE_URL");
  }

  const repo = getRepository();
  const storage = getStorage();
  const { getProviderRegistry } = await import("@/lib/providers/registry");
  const providers = getProviderRegistry()
    .all()
    .map((e) => `${e.provider.id}:${e.status}`)
    .join(",");
  console.log(
    JSON.stringify({
      event: "worker_start",
      queue: env.queueDriver,
      db: env.dbDriver,
      storage: storage.kind,
      concurrency: env.workerConcurrency,
      providers,
      ytdlp: await ytDlpVersion(),
    })
  );

  // Startup recovery: stale tmp from crashed runs, stalled jobs from
  // dead workers, and overdue retention purges — before accepting work.
  const { cleanupStaleTempDirs, purgeOldJobs, recoverStalledJobs } = await import("@/worker/cleanup");
  const { beatHeartbeat, setActiveJobs } = await import("@/lib/worker/heartbeat");
  const { getApiStore } = await import("@/lib/server");
  await cleanupStaleTempDirs();
  await purgeOldJobs(repo, { retentionMs: env.failedRetentionMs });

  // Queue handle for periodic stall recovery (set per driver below).
  let recoveryQueue: JobQueue | null = null;

  // Growth retention: notifications + email logs roll off after N days.
  // Transactional/billing history is untouched (separate tables).
  async function purgeGrowthLogs(): Promise<void> {
    try {
      const { getGrowthStore } = await import("@/lib/server");
      const store = getGrowthStore();
      const now = Date.now();
      const dayMs = 24 * 3600 * 1000;
      await store.purgeNotifications(now - env.notificationRetentionDays * dayMs, 200).catch(() => undefined);
      await store.purgeEmailLogs(now - env.emailLogRetentionDays * dayMs, 200).catch(() => undefined);
    } catch {
      // retention must never crash the sweep
    }
  }

  // Periodic sweep: expiry + retention + bounded-ledger purges + stall
  // recovery (all idempotent). Stall recovery also runs at startup; the
  // sweep covers mid-run crashes without waiting for the next deploy.
  const sweepTimer = setInterval(() => {
    expireJobs(repo, storage, Date.now(), 50).catch((err) => {
      console.error(JSON.stringify({ event: "cleanup_error", message: String(err) }));
    });
    purgeOldJobs(repo, { retentionMs: env.failedRetentionMs }).catch((err) => {
      console.error(JSON.stringify({ event: "retention_error", message: String(err) }));
    });
    getApiStore().purgeExpiredIdempotency(Date.now()).catch(() => undefined);
    getApiStore().purgeDeliveries(Date.now() - 30 * 24 * 3600 * 1000).catch(() => undefined);
    purgeGrowthLogs().catch(() => undefined);
    if (recoveryQueue) {
      recoverStalledJobs(repo, recoveryQueue, { stallTimeoutMs: env.stallTimeoutMs }).catch((err) => {
        console.error(JSON.stringify({ event: "recovery_error", message: String(err) }));
      });
    }
    beatHeartbeat().catch(() => undefined);
  }, 60_000);
  sweepTimer.unref?.();

  // Heartbeat for liveness monitoring.
  const beatTimer = setInterval(() => {
    console.log(JSON.stringify({ event: "worker_heartbeat", ts: new Date().toISOString() }));
  }, 60_000);
  beatTimer.unref?.();

  if (env.queueDriver !== "bullmq") {
    const { ensureLocalConsumer } = await import("@/lib/queue/dispatch");
    const { getLocalQueue } = await import("@/lib/queue/local");
    ensureLocalConsumer();
    console.log(JSON.stringify({ event: "worker_local_mode", note: "web process executes jobs; worker runs cleanup" }));
    recoveryQueue = getLocalQueue();
    await recoverStalledJobs(repo, getLocalQueue(), { stallTimeoutMs: env.stallTimeoutMs }).catch(() => undefined);
    await new Promise(() => undefined); // park until SIGTERM/SIGINT
    return;
  }

  const { BullMqJobQueue } = await import("@/lib/queue/bullmq");
  const jobQueue = new BullMqJobQueue(env.redisUrl as string);
  recoveryQueue = jobQueue;
  await recoverStalledJobs(repo, jobQueue, { stallTimeoutMs: env.stallTimeoutMs }).catch(() => undefined);

  // Heartbeat accounting: active download count drives capacity signals.
  let activeDownloads = 0;
  const trackActive = async <T>(fn: () => Promise<T>): Promise<T> => {
    activeDownloads += 1;
    setActiveJobs(activeDownloads);
    try {
      return await fn();
    } finally {
      activeDownloads -= 1;
      setActiveJobs(activeDownloads);
    }
  };

  const worker = new Worker<DownloadQueuePayload>(
    DOWNLOAD_QUEUE_NAME,
    async (job) => {
      const { jobId } = job.data;
      try {
        await trackActive(() => processDownload(jobId, { repo, storage, fileTtlMs: env.fileTtlMs }));
      } catch (err) {
        if ((err as { unrecoverable?: boolean }).unrecoverable) {
          throw new UnrecoverableError(String((err as Error).message));
        }
        throw err; // transient → BullMQ attempts + exponential backoff
      }
    },
    {
      connection: getRedisConnection(env.redisUrl as string),
      concurrency: env.workerConcurrency,
      lockDuration: env.workerLockMs,
      stalledInterval: 60_000,
    }
  );

  // Archive consumer: isolated queue + own concurrency so ZIP builds can
  // never starve download slots. Attempts are lower (expensive rebuilds).
  const archives = new Worker<ArchiveQueuePayload>(
    ARCHIVE_QUEUE_NAME,
    async (job) => {
      const { buildBatchArchive } = await import("@/worker/archive");
      await buildBatchArchive(job.data.batchId, { repo, storage });
    },
    {
      connection: getRedisConnection(env.redisUrl as string),
      concurrency: env.archiveConcurrency,
      lockDuration: env.workerLockMs,
      stalledInterval: 60_000,
    }
  );

  worker.on("completed", (job) => {
    console.log(JSON.stringify({ event: "job_completed", job: job.data.jobId, name: job.name }));
  });
  worker.on("failed", (job, err) => {
    console.log(
      JSON.stringify({ event: "job_failed", job: job?.data.jobId, message: String(err) })
    );
  });
  worker.on("error", (err) => {
    console.error(JSON.stringify({ event: "worker_error", message: String(err) }));
  });
  archives.on("completed", (job) => {
    console.log(JSON.stringify({ event: "archive_completed", batch: job.data.batchId }));
  });
  archives.on("failed", (job, err) => {
    console.log(
      JSON.stringify({ event: "archive_failed", batch: job?.data.batchId, message: String(err).slice(0, 200) })
    );
  });
  archives.on("error", (err) => {
    console.error(JSON.stringify({ event: "archive_error", message: String(err) }));
  });

  // Dedicated webhook consumer: bounded retries with backoff (set at
  // enqueue time); 4xx outcomes are recorded without retry by the deliverer.
  const webhooks = new Worker<WebhookQueuePayload>(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
      const { deliverWebhook } = await import("@/worker/webhook-worker");
      await deliverWebhook(job.data);
    },
    {
      connection: getRedisConnection(env.redisUrl as string),
      concurrency: Math.max(1, Math.floor(env.workerConcurrency / 2)),
    }
  );
  webhooks.on("failed", (job, err) => {
    console.log(JSON.stringify({ event: "webhook_failed", endpoint: job?.data.endpointId, message: String(err).slice(0, 200) }));
  });

  // Growth consumer: transactional/marketing email sends (bounded, idempotent rows).
  const growth = new Worker<GrowthQueuePayload>(
    GROWTH_QUEUE_NAME,
    async (job) => {
      const { sendEmailNow } = await import("@/lib/growth/email-outbox");
      await sendEmailNow(job.data.email);
    },
    {
      connection: getRedisConnection(env.redisUrl as string),
      concurrency: 2,
    }
  );
  growth.on("failed", (job, err) => {
    console.log(JSON.stringify({ event: "growth_failed", log: job?.data.email.logId, message: String(err).slice(0, 200) }));
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(JSON.stringify({ event: "worker_shutdown", signal }));
    clearInterval(sweepTimer);
    clearInterval(beatTimer);
    try {
      await worker.close(); // stop accepting, finish current job if safe
    } catch {
      // ignore
    }
    try {
      await archives.close();
    } catch {
      // ignore
    }
    try {
      await webhooks.close();
    } catch {
      // ignore
    }
    try {
      await growth.close();
    } catch {
      // ignore
    }
    try {
      await jobQueue.close();
    } catch {
      // ignore
    }
    await repo.close?.().catch(() => undefined);
    await closeRedisConnection().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(JSON.stringify({ event: "worker_fatal", message: String(err) }));
  process.exit(1);
});
