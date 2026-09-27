import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/server";
import { billingEnabled, getPaymentDriver } from "@/lib/billing/driver";
import { logger } from "@/lib/logger";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Cancel at period end. Capabilities continue until the paid period ends;
 * downgrade is evaluated lazily by the entitlement layer.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage billing."), { status: 401 });
  }
  if (!env.enableBilling || !billingEnabled()) {
    return NextResponse.json(errBody("BAD_REQUEST", "Billing is currently unavailable."), { status: 503 });
  }
  const store = getAccountStore();
  const sub = await store.getActiveSubscription(user.id);
  if (!sub) {
    return NextResponse.json(errBody("BAD_REQUEST", "No active subscription."), { status: 400 });
  }
  try {
    if (sub.externalSubscriptionId) {
      await getPaymentDriver().cancelSubscription(sub.externalSubscriptionId);
    }
    await store.upsertSubscription({ ...sub, cancelAtPeriodEnd: true, updatedAt: Date.now() });
    logger.info("subscription_cancel_requested", { user: user.id });
    return NextResponse.json({ success: true, data: {} });
  } catch {
    return NextResponse.json(errBody("TEMPORARILY_UNAVAILABLE", "Could not cancel right now. Please try again."), {
      status: 503,
    });
  }
}
