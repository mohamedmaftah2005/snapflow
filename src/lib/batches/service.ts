import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { AppError, statusFor, userMessageFor } from "@/lib/errors";
import { log, logger } from "@/lib/logger";
import { getProviderRegistry } from "@/lib/providers/registry";
import type { FormatRequest } from "@/lib/media/formats";
import type { ProviderId } from "@/lib/providers/types";
import { getEntitlement, queuePriorityFor, refundDownload, reserveDownload } from "@/lib/entitlements";
import { newJobId } from "@/services/downloader/store";
import { getBatchStore, getQueue, getRepository } from "@/lib/server";
import { pendingDepth } from "@/lib/queue/guard";
import { ensureLocalConsumer } from "@/lib/queue/dispatch";
import { inc } from "@/lib/metrics";
import { reportError } from "@/lib/error-monitoring";
import { batchProgress } from "@/lib/batches/progress";
import type { BatchProgress } from "@/lib/batches/types";
import type { UserRecord } from "@/lib/accounts/types";

function newBatchId(): string {
  return `bat_${randomBytes(12).toString("base64url")}`;
}

function guestKeyFor(ip: string, day: string): string {
  return createHash("sha256").update(`batch:${day}:${ip}`).digest("hex").slice(0, 32);
}

/** Bounded parallel map preserving input order (for network-bound fan-out). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface CreateBatchInput {
  urls: unknown[];
  format: FormatRequest;
  user: UserRecord | null;
  ip: string;
  requestId: string;
}

export type CreateBatchResult =
  | {
      ok: true;
      batchId: string;
      progress: BatchProgress;
      jobIds: string[];
      itemErrors?: { url: string; code: string; message: string }[];
    }
  | { ok: false; code: string; message: string; status: number; itemErrors?: { url: string; code: string; message: string }[] };

/**
 * Shared batch-creation core used by the web UI and the public v1 API.
 * Validates every URL individually; one bad URL never fails the batch.
 */
export async function createBatchJob(input: CreateBatchInput): Promise<CreateBatchResult> {
  const { urls: rawUrls, format, user, ip, requestId } = input;
  const fail = (code: string, message: string, status: number, itemErrors?: { url: string; code: string; message: string }[]): CreateBatchResult =>
    ({ ok: false, code, message, status, itemErrors });

  if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
    return fail("BAD_REQUEST", "Provide 1–25 URLs.", 400);
  }
  const ent = await getEntitlement(user);
  const planBatchLimit = ent.authenticated
    ? ent.plan.id === "premium" ? env.premiumBatchLimit : env.freeBatchLimit
    : env.guestBatchLimit;
  const urls = (rawUrls as unknown[]).slice(0, env.maxBatchItems + 1);
  if (urls.length > planBatchLimit) {
    return fail("PLAN_LIMIT_REACHED", `This batch exceeds your limit of ${planBatchLimit} URLs.`, 429);
  }
  if (urls.length > env.maxBatchItems) {
    return fail("BAD_REQUEST", `Batches are limited to ${env.maxBatchItems} URLs.`, 400);
  }

  // Validate each URL individually (provider detection + allowlist, no fetch).
  // Bounded-parallel: DNS validation is network-bound, so sequential
  // validation would serialize up to maxBatchItems lookups in the request.
  const registry = getProviderRegistry();
  const valid: { url: string; normalized: string; providerId: ProviderId }[] = [];
  const itemErrors: { url: string; code: string; message: string }[] = [];
  const validated = await mapLimit(urls, 5, async (raw) => {
    const s = typeof raw === "string" ? raw.trim().slice(0, 2048) : "";
    if (!s) return { ok: false as const, url: "", code: "INVALID_URL", message: "Empty entry." };
    try {
      new URL(s);
    } catch {
      return { ok: false as const, url: s.slice(0, 120), code: "INVALID_URL", message: "Not a valid URL." };
    }
    const provider = registry.resolve(s);
    if (!provider) {
      return { ok: false as const, url: s.slice(0, 120), code: "UNSUPPORTED_URL", message: "This link isn't supported." };
    }
    try {
      const normalized = await provider.validateUrl(s);
      return { ok: true as const, url: s.slice(0, 200), normalized, providerId: provider.id };
    } catch (err) {
      const e = err instanceof AppError ? err : new AppError("INVALID_URL");
      return { ok: false as const, url: s.slice(0, 120), code: e.code, message: e.userMessage };
    }
  });
  for (const r of validated) {
    if (r.ok) valid.push({ url: r.url, normalized: r.normalized, providerId: r.providerId });
    else itemErrors.push({ url: r.url, code: r.code, message: r.message });
  }
  if (valid.length === 0) {
    return fail("BAD_REQUEST", "No valid URLs in this batch.", 400, itemErrors);
  }

  // Full maintenance stops new admissions across all entry points.
  const { maintenanceMode } = await import("@/lib/admin/flags");
  if (await maintenanceMode()) {
    return fail(
      "TEMPORARILY_UNAVAILABLE",
      "Service temporarily unavailable. We are performing maintenance. Please try again later.",
      503,
      itemErrors
    );
  }

  // Backpressure: batches previously bypassed the queue-flooding guard.
  // Reject when this batch would overflow MAX_QUEUE_SIZE; fail open on
  // probe errors (same posture as single downloads).
  try {
    const depth = await pendingDepth();
    if (depth + valid.length > env.maxQueueSize) {
      inc("queue_rejected_total");
      logger.warn("queue_full_batch", { req: requestId, depth, items: valid.length });
      const code = "TEMPORARILY_UNAVAILABLE";
      return fail(code, userMessageFor(code), statusFor(code), itemErrors);
    }
    if (ent.userId) {
      const active = await getRepository().countActiveByUser(ent.userId);
      if (active + valid.length > env.maxActiveJobsPerUser) {
        inc("user_cap_rejected_total");
        logger.warn("user_cap_reached_batch", { req: requestId, user: ent.userId, active, items: valid.length });
        const code = "TEMPORARILY_UNAVAILABLE";
        return fail(code, userMessageFor(code), statusFor(code), itemErrors);
      }
    }
  } catch (err) {
    reportError(err, { route: "batch-depth", req: requestId });
  }

  // Reserve N usage units (all-or-nothing; refunded below on failure).
  let reserved = 0;
  try {
    for (let i = 0; i < valid.length; i++) {
      if (!(await reserveDownload(ent, ip))) break;
      reserved += 1;
    }
    if (reserved < valid.length) {
      for (let i = 0; i < reserved; i++) await refundDownload(ent, ip);
      const code = "PLAN_LIMIT_REACHED";
      return fail(code, userMessageFor(code), statusFor(code));
    }
  } catch (err) {
    reportError(err, { route: "batch-reserve", req: requestId });
    const code = "TEMPORARILY_UNAVAILABLE";
    return fail(code, userMessageFor(code), statusFor(code));
  }

  const batchId = newBatchId();
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const batchStore = getBatchStore();
  await batchStore.createBatch({
    id: batchId,
    userId: ent.userId,
    guestKey: ent.userId ? undefined : guestKeyFor(ip, day),
    status: "QUEUED",
    formatKind: format.kind,
    formatHeight: format.kind === "video" ? format.maxHeight : undefined,
    createdAt: now,
  });

  const repo = getRepository();
  const priority =
    (ent.plan.id === "premium" ? queuePriorityFor("premium") : queuePriorityFor("free")) + 5; // batches yield to singles
  const jobIds: string[] = [];
  try {
    ensureLocalConsumer();
    for (const v of valid) {
      const jobId = newJobId();
      const effectiveCap =
        ent.plan.maxFileSizeBytes === null ? env.maxFileSizeBytes : Math.min(ent.plan.maxFileSizeBytes, env.maxFileSizeBytes);
      await repo.create({
        id: jobId,
        status: "QUEUED",
        provider: v.providerId,
        sourceUrl: v.normalized,
        userId: ent.userId,
        maxFileSize: effectiveCap,
        formatKind: format.kind,
        formatHeight: format.kind === "video" ? format.maxHeight : undefined,
        attempts: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + env.fileTtlMs,
      });
      await getQueue().enqueue({ jobId, url: v.normalized, provider: v.providerId }, { priority });
      jobIds.push(jobId);
    }
    await batchStore.addItems(batchId, jobIds);
  } catch (err) {
    for (let i = 0; i < reserved; i++) await refundDownload(ent, ip).catch(() => undefined);
    reportError(err, { route: "batch-enqueue", req: requestId });
    const code = "TEMPORARILY_UNAVAILABLE";
    return fail(code, userMessageFor(code), statusFor(code));
  }

  const batch = await batchStore.getBatch(batchId);
  log(batchId, "batch created", { items: jobIds.length, plan: ent.plan.id });
  logger.info("batch_created", { req: requestId, batch: batchId, items: jobIds.length });
  inc("batches_created_total");
  return {
    ok: true,
    batchId,
    progress: await batchProgress(batch!),
    jobIds,
    itemErrors: itemErrors.length > 0 ? itemErrors : undefined,
  };
}
