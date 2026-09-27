import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBatchStore, getQueue, getRepository } from "@/lib/server";
import { checkBatchAccess } from "@/lib/batches/progress";
import { audit } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/admin/permissions";
import { isRetryableCode } from "@/worker/pipeline";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

async function loadOwned(req: Request, id: string, adminBypass: boolean): Promise<
  | { error: NextResponse }
  | { batch: import("@/lib/batches/types").BatchRecord; viewer: import("@/lib/accounts/types").UserRecord | null }
> {
  if (!/^bat_[A-Za-z0-9_-]{8,64}$/.test(id)) return { error: NextResponse.json(errBody("BAD_REQUEST", "Invalid batch ID."), { status: 400 }) };
  const batch = await getBatchStore().getBatch(id);
  if (!batch) return { error: NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 }) };
  const viewer = await getSessionUser(req);
  const admin = adminBypass && viewer && hasPermission(viewer.role, "JOB_MANAGE") ? viewer : null;
  if (!admin && !(await checkBatchAccess(batch, viewer?.id ?? null))) {
    return { error: NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 }) };
  }
  return { batch, viewer: admin ?? viewer };
}

/** Cancel a batch: pending children go CANCELED; in-flight work drains via pipeline checks. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }): Promise<NextResponse> {
  const { id, action } = await ctx.params;
  const loaded = await loadOwned(req, id, true);
  if ("error" in loaded) return loaded.error;
  const { viewer } = loaded;
  const repo = getRepository();

  if (action === "cancel") {
    const jobIds = await getBatchStore().getBatchJobIds(id);
    let canceled = 0;
    for (const jid of jobIds) {
      const j = await repo.get(jid);
      if (j && (j.status === "QUEUED" || j.status === "PENDING" || j.status === "PROCESSING")) {
        await repo.update(jid, { status: "CANCELED", errorCode: "CANCELED", errorMessage: "Canceled." });
        canceled += 1;
      }
    }
    await getBatchStore().updateBatch(id, { status: "CANCELED", completedAt: Date.now() });
    const { emitWebhookEvent } = await import("@/lib/webhooks/emit");
    const batchRow = await getBatchStore().getBatch(id);
    await emitWebhookEvent(batchRow?.userId, "batch.canceled", { batch_id: id, status: "CANCELED" }).catch(() => undefined);
    if (viewer && hasPermission(viewer.role, "JOB_MANAGE")) {
      await audit({
        actorUserId: viewer.id, actorRole: viewer.role, action: "JOB_CANCELED",
        targetType: "batch", targetId: id, reason: "operator batch cancel",
      });
    }
    return NextResponse.json({ success: true, data: { canceled } });
  }

  if (action === "retry") {
    // Only retryable failed children; successes never rerun.
    const jobIds = await getBatchStore().getBatchJobIds(id);
    let retried = 0;
    for (const jid of jobIds) {
      const j = await repo.get(jid);
      if (j && j.status === "FAILED" && j.errorCode && isRetryableCode(j.errorCode)) {
        await repo.update(jid, { status: "QUEUED", errorCode: undefined, errorMessage: undefined });
        await getQueue().enqueue({ jobId: jid, url: j.sourceUrl, provider: j.provider });
        retried += 1;
      }
    }
    await getBatchStore().updateBatch(id, { status: "QUEUED", completedAt: undefined });
    if (viewer && hasPermission(viewer.role, "JOB_MANAGE")) {
      await audit({
        actorUserId: viewer.id, actorRole: viewer.role, action: "JOB_RETRIED",
        targetType: "batch", targetId: id, reason: "operator batch retry",
      });
    }
    return NextResponse.json({ success: true, data: { retried } });
  }

  return NextResponse.json(errBody("BAD_REQUEST", "Unknown action."), { status: 400 });
}
