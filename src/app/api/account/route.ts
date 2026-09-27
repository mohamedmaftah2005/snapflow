import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getEntitlement, usageFor } from "@/lib/entitlements";
import { getClientIp } from "@/lib/client-ip";

/** Session context for UI + analytics (plan/authenticated, never secrets). */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({
      success: true,
      data: { authenticated: false, plan: "free" },
    });
  }
  try {
    const ent = await getEntitlement(user);
    const usage = await usageFor(ent, getClientIp(req));
    return NextResponse.json({
      success: true,
      data: {
        authenticated: true,
        plan: ent.plan.id,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: Boolean(user.emailVerifiedAt),
        },
        usage,
      },
    });
  } catch {
    return NextResponse.json({ success: true, data: { authenticated: true, plan: "free" } });
  }
}
