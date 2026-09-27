import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGrowthStore } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in."), { status: 401 });
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid ID."), { status: 400 });
  }
  const ok = await getGrowthStore().markRead(user.id, id);
  if (!ok) {
    return NextResponse.json(errBody("BAD_REQUEST", "Notification not found."), { status: 404 });
  }
  return NextResponse.json({ success: true, data: {} });
}
