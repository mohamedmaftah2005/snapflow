import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getBatchStore } from "@/lib/server";
import { batchProgress } from "@/lib/batches/progress";

/** Recent batches with live progress. Paginated (default 20). */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "JOB_VIEW");
  if ("error" in gate) return gate.error;
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 20) || 20, 1), 50);
  const page = Math.max(Number(q.get("page") ?? 1) || 1, 1);
  const { batches, total } = await getBatchStore().listRecent(limit, (page - 1) * limit);
  const rows = [];
  for (const b of batches) {
    rows.push({ ...(await batchProgress(b)), userId: b.userId ?? null, createdAt: b.createdAt });
  }
  return NextResponse.json({ success: true, data: { batches: rows, total, page, limit } });
}
