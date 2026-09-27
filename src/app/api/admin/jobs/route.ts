import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getRepository } from "@/lib/server";

function pageParams(url: string): { limit: number; offset: number; status?: string; provider?: string; userId?: string } {
  const u = new URL(url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 20) || 20, 1), 50);
  const page = Math.max(Number(u.searchParams.get("page") ?? 1) || 1, 1);
  return {
    limit,
    offset: (page - 1) * limit,
    status: u.searchParams.get("status") ?? undefined,
    provider: u.searchParams.get("provider") ?? undefined,
    userId: u.searchParams.get("userId") ?? undefined,
  };
}

const VALID = new Set(["PENDING", "QUEUED", "PROCESSING", "UPLOADING", "COMPLETED", "FAILED", "EXPIRED", "CANCELED"]);

/** Paginated job search with sanitized URLs. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "JOB_VIEW");
  if ("error" in gate) return gate.error;
  const p = pageParams(req.url);
  if (p.status && !VALID.has(p.status)) {
    return NextResponse.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid status." } }, { status: 400 });
  }
  const { jobs, total } = await getRepository().listJobs(p);
  return NextResponse.json({
    success: true,
    data: {
      jobs: jobs.map((j) => ({
        id: j.id, provider: j.provider, status: j.status, userId: j.userId ?? null,
        title: j.title ?? "Media", createdAt: j.createdAt, startedAt: j.startedAt,
        completedAt: j.completedAt, durationMs: j.startedAt && j.completedAt ? j.completedAt - j.startedAt : null,
        fileSize: j.fileSize, errorCode: j.errorCode,
      })),
      total, limit: p.limit, offset: p.offset,
    },
  });
}
