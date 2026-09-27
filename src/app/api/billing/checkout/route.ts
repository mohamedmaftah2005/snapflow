import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { billingEnabled, getPaymentDriver } from "@/lib/billing/driver";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Creates a checkout session and returns the provider-hosted URL. */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to upgrade."), { status: 401 });
  }
  if (!env.enableCheckout || !billingEnabled()) {
    return NextResponse.json(errBody("BAD_REQUEST", "Checkout is currently unavailable."), { status: 503 });
  }
  try {
    const driver = getPaymentDriver();
    const { url } = await driver.createCheckout({
      userId: user.id,
      email: user.email,
      successUrl: `${env.appUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${env.appUrl}/pricing?checkout=cancelled`,
    });
    return NextResponse.json({ success: true, data: { url } });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("TEMPORARILY_UNAVAILABLE");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
}
