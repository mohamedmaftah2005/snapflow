import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Current subscription view. No card numbers, no secrets — ever. */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to view billing."), { status: 401 });
  }
  const store = getAccountStore();
  const sub = await store.getActiveSubscription(user.id);
  if (!sub) {
    return NextResponse.json({ success: true, data: { plan: "free", subscription: null } });
  }
  return NextResponse.json({
    success: true,
    data: {
      plan: sub.planId,
      subscription: {
        status: sub.status,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null,
      },
    },
  });
}
