import { NextResponse } from "next/server";
import { requireApiKey, v1Error, v1Ok } from "../../_auth";
import { getBatchStore, getRepository } from "@/lib/server";

/** GET /api/v1/batches/:id — owner-scoped aggregate progress. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["batches:read"]);
  if ("error" in gate) return gate.error;
  const { ctx: c } = gate;
  const { id } = await ctx.params;
  if (!/^bat_[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return v1Error("INVALID_REQUEST", "Invalid batch ID.", c.requestId, 400);
  }
  const batch = await getBatchStore().getBatch(id);
  if (!batch || batch.userId !== c.user.id) {
    return v1Error("DOWNLOAD_NOT_FOUND", "Batch not found.", c.requestId, 404);
  }
  const { batchProgress } = await import("@/lib/batches/progress");
  const p = await batchProgress(batch);
  const repo = getRepository();
  const jobIds = await getBatchStore().getBatchJobIds(id);
  const items = [];
  for (const jid of jobIds) {
    const j = await repo.get(jid);
    if (!j) continue;
    items.push({ download_id: jid, status: j.status, status_url: `/api/v1/downloads/${jid}` });
  }
  return v1Ok({ id: p.id, status: p.status, total: p.total, completed: p.completed, failed: p.failed, items }, c.requestId);
}
