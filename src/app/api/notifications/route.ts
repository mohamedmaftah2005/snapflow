import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGrowthStore } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Notification center list (newest first, capped). */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to view notifications."), { status: 401 });
  }
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20, 1), 50);
  const store = getGrowthStore();
  return NextResponse.json({
    success: true,
    data: {
      notifications: await store.listNotifications(user.id, limit),
      unread: await store.countUnread(user.id),
    },
  });
}
