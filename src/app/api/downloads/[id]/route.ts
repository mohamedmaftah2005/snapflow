import { NextResponse } from "next/server";
import { isValidFileId } from "@/services/downloader/store";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore, getRepository, getStorage } from "@/lib/server";
import { cleanupJobDir } from "@/services/downloader/TikTokDownloader";
import type { DownloadJobRecord } from "@/lib/jobs/types";
import type { UserRecord } from "@/lib/accounts/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

async function owned(req: Request, id: string): Promise<{ error: NextResponse } | { job: DownloadJobRecord; user: UserRecord }> {
  if (!isValidFileId(id)) {
    return { error: NextResponse.json(errBody("BAD_REQUEST", "Invalid ID."), { status: 400 }) };
  }
  const user = await getSessionUser(req);
  if (!user) {
    return { error: NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage history."), { status: 401 }) };
  }
  const job = await getRepository().get(id);
  if (!job || job.userId !== user.id) {
    return { error: NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Not found."), { status: 404 }) };
  }
  return { job, user };
}

/**
 * Delete a history entry: removes metadata rows and any live storage
 * objects (best effort). Saved bookmarks for it go too.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const loaded = await owned(req, id);
  if ("error" in loaded) return loaded.error;
  const storage = getStorage();
  try {
    const items = await getRepository().getItems(id);
    for (const it of items) {
      if (it.fileKey) await storage.remove(it.fileKey).catch(() => undefined);
    }
    await cleanupJobDir(id);
    await getAccountStore().unsaveJob(loaded.user.id, id);
    await getRepository().deleteJob(id);
  } catch {
    return NextResponse.json(errBody("TEMPORARILY_UNAVAILABLE", "Could not delete right now."), { status: 503 });
  }
  return NextResponse.json({ success: true, data: {} });
}
