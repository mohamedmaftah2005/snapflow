import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { expiredCookie } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { env } from "@/lib/config/env";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Safe deletion: requires typed confirmation, anonymizes the user row
 * (billing/audit history keeps anonymous records), kills sessions.
 * Active subscriptions keep their provider-side state; local entitlements
 * end with the account.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage your account."), { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["confirm"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (body.confirm !== "DELETE") {
    const e = new AppError("BAD_REQUEST", "Type DELETE to confirm account deletion.");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const subs = await getAccountStore().listSubscriptions(user.id);
  const active = subs.find((s) => s.status === "ACTIVE" || s.status === "TRIALING" || s.status === "PAST_DUE");
  if (active) {
    const e = new AppError("BAD_REQUEST", "Cancel your subscription first, then delete your account.");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  await getAccountStore().anonymizeUser(user.id);
  const res = NextResponse.json({ success: true, data: {} });
  res.headers.set("Set-Cookie", expiredCookie());
  return res;
}
