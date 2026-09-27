import { NextResponse } from "next/server";
import { AuthService } from "@/lib/auth/service";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/server";
import { authGuard, errBody } from "../_helpers";

/** Re-send the verification email. Authenticated, rate-limited, idempotent. */
export async function POST(req: Request): Promise<NextResponse> {
  const guard = await authGuard(req);
  if (guard) return guard;
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in first."), { status: 401 });
  }
  // Generic outcome either way: verification state stays private.
  await new AuthService(getAccountStore()).resendVerification(user.id).catch(() => undefined);
  return NextResponse.json({ success: true, data: { message: "If your email is unverified, a new link is on its way." } });
}
