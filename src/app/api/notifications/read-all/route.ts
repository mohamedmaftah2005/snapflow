import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGrowthStore } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in."), { status: 401 });
  }
  const marked = await getGrowthStore().markAllRead(user.id);
  return NextResponse.json({ success: true, data: { marked } });
}
