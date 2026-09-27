import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getRepository } from "@/lib/server";
import { isRetryableCode } from "@/worker/pipeline";

/** Safe operational job detail: sanitized errors, retryability, no secrets. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requirePermission(req, "JOB_VIEW");
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const job = await getRepository().get(id);
  if (!job) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Job not found." } }, { status: 404 });
  }
  const items = await getRepository().getItems(id);
  return NextResponse.json({
    success: true,
    data: {
      id: job.id, provider: job.provider, mediaType: job.mediaType, status: job.status,
      userId: job.userId ?? null, sourceId: job.sourceId,
      title: job.title ?? "Media", attempts: job.attempts,
      createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt,
      expiresAt: job.expiresAt, fileSize: job.fileSize,
      items: items.map((it) => ({
        id: it.id, type: it.type, format: it.format, container: it.container,
        resolution: it.resolution, fileSize: it.fileSize,
      })),
      error: job.errorCode
        ? { code: job.errorCode, retryable: isRetryableCode(job.errorCode) }
        : null,
      retryable: job.status === "FAILED" && job.errorCode ? isRetryableCode(job.errorCode) : false,
      cancelable: job.status === "QUEUED" || job.status === "PROCESSING" || job.status === "PENDING",
    },
  });
}
