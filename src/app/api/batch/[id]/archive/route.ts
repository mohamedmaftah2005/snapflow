import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBatchStore, getQueue, getRepository } from "@/lib/server";
import { checkBatchAccess } from "@/lib/batches/progress";
import { ensureLocalConsumer } from "@/lib/queue/dispatch";
import { inc } from "@/lib/metrics";
import { reportError } from "@/lib/error-monitoring";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

function validId(id: string): boolean {
  return /^bat_[A-Za-z0-9_-]{8,64}$/.test(id);
}

/**
 * Request a ZIP of the batch's completed items. Idempotent: a valid
 * existing archive is returned without rebuilding.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!validId(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid batch ID."), { status: 400 });
  }
  const { isEnabled } = await import("@/lib/admin/flags");
  if (!(await isEnabled("zip_downloads", true))) {
    return NextResponse.json(errBody("BAD_REQUEST", "ZIP downloads are currently disabled."), { status: 503 });
  }
  const batchStore = getBatchStore();
  const batch = await batchStore.getBatch(id);
  if (!batch) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 });
  }
  const viewer = await getSessionUser(req);
  if (!(await checkBatchAccess(batch, viewer?.id ?? null))) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 });
  }
  if (batch.archiveKey && batch.archiveExpires && batch.archiveExpires > Date.now()) {
    return NextResponse.json({ success: true, data: { status: "READY" } }, { status: 200 });
  }
  // Require at least one completed item before queuing archive work.
  const repo = getRepository();
  const jobIds = await batchStore.getBatchJobIds(id);
  let completed = 0;
  for (const jid of jobIds) {
    if ((await repo.get(jid))?.status === "COMPLETED") completed += 1;
  }
  if (completed === 0) {
    return NextResponse.json(errBody("BAD_REQUEST", "No completed files to archive yet."), { status: 400 });
  }
  try {
    ensureLocalConsumer();
    const q = getQueue();
    if (q.enqueueArchive) await q.enqueueArchive(id);
    else {
      const { getLocalQueue } = await import("@/lib/queue/local");
      await getLocalQueue().enqueueArchive(id);
    }
  } catch (err) {
    reportError(err, { route: "archive-enqueue", batch: id });
    return NextResponse.json(errBody("TEMPORARILY_UNAVAILABLE", "Our service is busy. Please try again shortly."), { status: 503 });
  }
  inc("archives_requested_total");
  return NextResponse.json({ success: true, data: { status: "QUEUED" } }, { status: 202 });
}
