import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getQueue, getRepository } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { isRetryableCode } from "@/worker/pipeline";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Controlled job actions. Retry is idempotent: only FAILED+retryable jobs
 * are reset to QUEUED and re-enqueued (BullMQ dedupes by jobId; the
 * pipeline skips anything already terminal).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; action: string }> }
): Promise<NextResponse> {
  const gate = await requirePermission(req, "JOB_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  const { id, action } = await ctx.params;

  let body: Record<string, unknown> = {};
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["reason"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 3) {
    return NextResponse.json(errBody("BAD_REQUEST", "A reason (min 3 chars) is required."), { status: 400 });
  }

  const repo = getRepository();
  const job = await repo.get(id);
  if (!job) {
    return NextResponse.json(errBody("NOT_FOUND", "Job not found."), { status: 404 });
  }

  if (action === "retry") {
    if (job.status !== "FAILED" || !job.errorCode || !isRetryableCode(job.errorCode)) {
      return NextResponse.json(errBody("BAD_REQUEST", "The job is no longer retryable."), { status: 400 });
    }
    await repo.update(id, { status: "QUEUED", errorCode: undefined, errorMessage: undefined });
    await getQueue().enqueue({ jobId: id, url: job.sourceUrl, provider: job.provider });
    await audit({
      actorUserId: admin.user.id, actorRole: admin.user.role, action: "JOB_RETRIED",
      targetType: "job", targetId: id, reason, requestId: admin.requestId,
    });
    return NextResponse.json({ success: true, data: { status: "QUEUED" } });
  }

  if (action === "cancel") {
    if (job.status !== "QUEUED" && job.status !== "PROCESSING" && job.status !== "PENDING") {
      return NextResponse.json(errBody("BAD_REQUEST", "Only pending jobs can be canceled."), { status: 400 });
    }
    await repo.update(id, { status: "CANCELED", errorCode: "CANCELED", errorMessage: "Canceled by an operator." });
    await audit({
      actorUserId: admin.user.id, actorRole: admin.user.role, action: "JOB_CANCELED",
      targetType: "job", targetId: id, reason, requestId: admin.requestId,
    });
    return NextResponse.json({ success: true, data: { status: "CANCELED" } });
  }

  if (action === "expire") {
    if (job.status !== "COMPLETED") {
      return NextResponse.json(errBody("BAD_REQUEST", "Only completed jobs can be expired early."), { status: 400 });
    }
    const { expireJobs } = await import("@/worker/cleanup");
    const { getStorage } = await import("@/lib/server");
    await repo.update(id, { expiresAt: Date.now() - 1 });
    await expireJobs(repo, getStorage(), Date.now(), 1);
    await audit({
      actorUserId: admin.user.id, actorRole: admin.user.role, action: "JOB_EXPIRED",
      targetType: "job", targetId: id, reason, requestId: admin.requestId,
    });
    return NextResponse.json({ success: true, data: { status: "EXPIRED" } });
  }

  return NextResponse.json(errBody("BAD_REQUEST", "Unknown action."), { status: 400 });
}
