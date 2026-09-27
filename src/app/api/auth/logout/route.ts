import { NextResponse } from "next/server";
import { AuthService, expiredCookie } from "@/lib/auth/service";
import { getSessionToken } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/server";
import { authGuard } from "../_helpers";

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await authGuard(req);
  if (guard) return guard;
  const token = getSessionToken(req);
  if (token) {
    try {
      await new AuthService(getAccountStore()).logout(token);
    } catch {
      // logout is best-effort; cookie is cleared regardless
    }
  }
  const res = NextResponse.json({ success: true, data: {} });
  res.headers.set("Set-Cookie", expiredCookie());
  return res;
}
