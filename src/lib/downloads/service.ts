import { env } from "@/lib/config/env";
import { AppError, statusFor, userMessageFor } from "@/lib/errors";
import { log, logger, sanitizeForLog } from "@/lib/logger";
import { getProviderRegistry } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import type { FormatRequest } from "@/lib/media/formats";
import { getIdempotencyStore } from "@/lib/idempotency";
import { pendingDepth, queueFull } from "@/lib/queue/guard";
import { getEntitlement, queuePriorityFor, refundDownload, reserveDownload } from "@/lib/entitlements";
import { newJobId } from "@/services/downloader/store";
import { getQueue, getRepository } from "@/lib/server";
import { ensureLocalConsumer } from "@/lib/queue/dispatch";
import { inc } from "@/lib/metrics";
import { reportError } from "@/lib/error-monitoring";
import type { UserRecord } from "@/lib/accounts/types";

export interface CreateDownloadInput {
  url: string;
  format: FormatRequest;
  user: UserRecord | null;
  ip: string;
  idempotencyKey?: string;
  requestId: string;
}

export type CreateDownloadResult =
  | { ok: true; jobId: string; status: string; deduplicated?: boolean }
  | { ok: false; code: string; message: string; status: number };

/**
 * Shared download-creation core used by the web UI and the public v1 API.
 * Flow: validate → entitlement → reserve → depth guard → persist → enqueue.
 * The worker receives an already-authorized job and decides nothing.
 */
export async function createDownloadJob(input: CreateDownloadInput): Promise<CreateDownloadResult> {
  const { url, format, user, ip, requestId } = input;
  const logCtx = { req: requestId };
  const fail = (code: string, message: string, status: number): CreateDownloadResult => ({ ok: false, code, message, status });

  if (input.idempotencyKey) {
    const existingId = await getIdempotencyStore(
      env.queueDriver === "bullmq" ? env.redisUrl : undefined
    ).get(input.idempotencyKey);
    if (existingId) {
      const existing = await getRepository().get(existingId);
      if (existing && existing.status !== "FAILED" && existing.status !== "EXPIRED") {
        inc("idempotent_hits_total");
        logger.info("job_deduplicated", { ...logCtx, job: existingId });
        return { ok: true, jobId: existingId, status: existing.status, deduplicated: true };
      }
    }
  }

  const jobId = newJobId();
  log(jobId, "job received", { from: ip === "direct" ? "direct" : "proxy" });

  // Full maintenance is enforced here (not only in the web route) so every
  // entry point — web UI, batch fan-out, public API — honors it. Existing
  // jobs keep processing; only new admissions stop.
  const { maintenanceMode } = await import("@/lib/admin/flags");
  if (await maintenanceMode()) {
    return fail(
      "TEMPORARILY_UNAVAILABLE",
      "Service temporarily unavailable. We are performing maintenance. Please try again later.",
      503
    );
  }

  let normalized: string;
  let providerId: ProviderId;
  try {
    try {
      new URL(url.trim());
    } catch {
      throw new AppError("INVALID_URL");
    }
    const provider = getProviderRegistry().resolve(url);
    if (!provider) throw new AppError("UNSUPPORTED_URL");
    providerId = provider.id;
    normalized = await provider.validateUrl(url);
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("INVALID_URL");
    log(jobId, "url validation failed", { code: e.code, url: sanitizeForLog(String(url).slice(0, 120)) });
    return fail(e.code, e.userMessage, e.status);
  }

  const ent = await getEntitlement(user);
  const reserved = await reserveDownload(ent, ip);
  if (!reserved) {
    inc("plan_limited_total");
    logger.info("plan_limit_reached", { ...logCtx, plan: ent.plan.id, authenticated: ent.authenticated });
    const code = "PLAN_LIMIT_REACHED";
    return fail(code, userMessageFor(code), statusFor(code));
  }

  try {
    const depth = await pendingDepth();
    if (queueFull(depth)) {
      await refundDownload(ent, ip);
      inc("queue_rejected_total");
      logger.warn("queue_full", { ...logCtx, depth });
      const code = "TEMPORARILY_UNAVAILABLE";
      return fail(code, userMessageFor(code), statusFor(code));
    }
  } catch (err) {
    reportError(err, { ...logCtx, route: "queue-depth" });
  }

  // Per-user fairness: one account cannot occupy every worker slot.
  // Fail-open on store errors (same posture as the depth guard).
  if (ent.userId) {
    try {
      const active = await getRepository().countActiveByUser(ent.userId);
      if (active >= env.maxActiveJobsPerUser) {
        await refundDownload(ent, ip);
        inc("user_cap_rejected_total");
        logger.warn("user_cap_reached", { ...logCtx, user: ent.userId, active });
        const code = "TEMPORARILY_UNAVAILABLE";
        return fail(code, userMessageFor(code), statusFor(code));
      }
    } catch (err) {
      reportError(err, { ...logCtx, route: "user-depth" });
    }
  }

  const repo = getRepository();
  const now = Date.now();
  const effectiveCap =
    ent.plan.maxFileSizeBytes === null ? env.maxFileSizeBytes : Math.min(ent.plan.maxFileSizeBytes, env.maxFileSizeBytes);
  await repo.create({
    id: jobId,
    status: "QUEUED",
    provider: providerId,
    sourceUrl: normalized,
    userId: ent.userId,
    maxFileSize: effectiveCap,
    formatKind: format.kind,
    formatHeight: format.kind === "video" ? format.maxHeight : undefined,
    attempts: 0,
    createdAt: now,
    expiresAt: now + env.fileTtlMs,
  });
  logger.info("job_created", { ...logCtx, job: jobId, provider: providerId, plan: ent.plan.id });
  inc("jobs_created_total");
  inc(`jobs_created_${providerId}_total`);
  inc(`jobs_created_plan_${ent.plan.id}_total`);
  if (input.idempotencyKey) {
    await getIdempotencyStore(env.queueDriver === "bullmq" ? env.redisUrl : undefined).set(
      input.idempotencyKey,
      jobId,
      env.fileTtlMs
    );
  }

  try {
    ensureLocalConsumer();
    await getQueue().enqueue(
      { jobId, url: normalized, provider: providerId },
      { priority: queuePriorityFor(ent.plan.id) }
    );
  } catch (err) {
    await refundDownload(ent, ip);
    reportError(err, { ...logCtx, route: "enqueue", job: jobId });
    await repo.update(jobId, { status: "FAILED", errorCode: "TEMPORARILY_UNAVAILABLE" });
    const code = "TEMPORARILY_UNAVAILABLE";
    return fail(code, userMessageFor(code), statusFor(code));
  }
  logger.info("job_queued", { ...logCtx, job: jobId, durationMs: Date.now() - now });
  return { ok: true, jobId, status: "QUEUED" };
}
