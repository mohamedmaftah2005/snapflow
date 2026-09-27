import { NextResponse } from "next/server";
import { isValidFileId } from "@/services/downloader/store";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore, getRepository } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Save/unsave metadata bookmarks. Media still expires normally. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!isValidFileId(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid ID."), { status: 400 });
  }
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to save downloads."), { status: 401 });
  }
  const job = await getRepository().get(id);
  if (!job || job.userId !== user.id) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Not found."), { status: 404 });
  }
  await getAccountStore().saveJob(user.id, id);
  return NextResponse.json({ success: true, data: { saved: true } });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage saved downloads."), { status: 401 });
  }
  await getAccountStore().unsaveJob(user.id, id);
  return NextResponse.json({ success: true, data: { saved: false } });
}
