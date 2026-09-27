import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBatchStore } from "@/lib/server";
import { batchProgress, checkBatchAccess } from "@/lib/batches/progress";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Batch progress aggregation. No queue internals exposed. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!/^bat_[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid batch ID."), { status: 400 });
  }
  const batch = await getBatchStore().getBatch(id);
  if (!batch) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 });
  }
  const viewer = await getSessionUser(req);
  if (!(await checkBatchAccess(batch, viewer?.id ?? null))) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 });
  }
  return NextResponse.json(
    { success: true, data: await batchProgress(batch) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
