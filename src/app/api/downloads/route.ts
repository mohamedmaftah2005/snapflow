import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore, getRepository } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Owner-only download history with filters + pagination. No full scans. */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to view your history."), { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 20) || 20, 1), 50);
  const cursor = q.get("cursor") ?? undefined;
  const page = Math.max(Number(q.get("page") ?? 1) || 1, 1);
  const status = q.get("status") ?? undefined;
  const provider = q.get("provider") ?? undefined;
  if (status && !["QUEUED", "PROCESSING", "UPLOADING", "COMPLETED", "FAILED", "EXPIRED", "CANCELED", "PENDING"].includes(status)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid status filter."), { status: 400 });
  }
  if (provider && !["tiktok", "youtube", "instagram"].includes(provider)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid provider filter."), { status: 400 });
  }
  const repo = getRepository();
  const saved = new Set(await getAccountStore().listSavedIds(user.id));
  const shape = (j: {
    id: string; provider: string; mediaType?: string; title?: string; status: string;
    createdAt: number; expiresAt: number; sourceUrl: string;
  }) => ({
    id: j.id,
    provider: j.provider,
    mediaType: j.mediaType ?? "VIDEO",
    title: j.title ?? "Media",
    status: j.status,
    createdAt: new Date(j.createdAt).toISOString(),
    expiresAt: new Date(j.expiresAt).toISOString(),
    expired: Date.now() > j.expiresAt,
    saved: saved.has(j.id),
    // Owner-only: their own previously submitted URL, for "download again".
    url: j.sourceUrl,
  });
  // Cursor mode: single query, no COUNT, stable under inserts.
  if (cursor) {
    const { jobs, nextCursor } = await repo.listHistoryCursor(user.id, { status, provider, limit, cursor });
    return NextResponse.json({
      success: true,
      data: { jobs: jobs.map(shape), nextCursor, limit },
    });
  }
  const { jobs, total } = await repo.listHistory(user.id, {
    status, provider, limit, offset: (page - 1) * limit,
  });
  return NextResponse.json({
    success: true,
    data: {
      jobs: jobs.map(shape),
      total,
      page,
      limit,
    },
  });
}
