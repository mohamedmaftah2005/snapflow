import fs from "node:fs";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBatchStore, getStorage } from "@/lib/server";
import { checkBatchAccess } from "@/lib/batches/progress";
import { LocalObjectStorage } from "@/lib/storage/local";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Download the batch ZIP. Expired archives are deleted and report 410. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!/^bat_[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid batch ID."), { status: 400 });
  }
  const batchStore = getBatchStore();
  const batch = await batchStore.getBatch(id);
  if (!batch?.archiveKey) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "No archive for this batch yet."), { status: 404 });
  }
  const viewer = await getSessionUser(req);
  if (!(await checkBatchAccess(batch, viewer?.id ?? null))) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Batch not found."), { status: 404 });
  }
  if (!batch.archiveExpires || batch.archiveExpires < Date.now()) {
    // Lazy expiry: delete the object and clear the record.
    const storage = getStorage();
    await storage.remove(batch.archiveKey).catch(() => undefined);
    await batchStore.updateBatch(id, { archiveKey: undefined, archiveSize: undefined, archiveExpires: undefined });
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This archive has expired."), { status: 410 });
  }
  const storage = getStorage();
  if (storage.kind === "s3") {
    return NextResponse.redirect(await storage.getSignedUrl(batch.archiveKey));
  }
  const local = storage as LocalObjectStorage;
  const full = local.localPathFor(batch.archiveKey);
  let stat: { size: number };
  try {
    stat = await fs.promises.stat(full);
  } catch {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Archive unavailable."), { status: 404 });
  }
  const stream = fs.createReadStream(full);
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="snapflow-batch-${id}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
