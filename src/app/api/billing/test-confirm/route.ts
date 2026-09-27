import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { getSessionUser } from "@/lib/auth/session";
import { applyPaymentEvent } from "@/lib/billing/subscriptions";
import { TestPaymentDriver } from "@/lib/billing/test-driver";
import { readJsonBody } from "@/lib/validation/request";
import { AppError } from "@/lib/errors";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Dev-only confirmation for the test billing driver: simulates the user
 * completing (or abandoning) provider-hosted checkout, then runs the SAME
 * webhook-application path (idempotent ledger included).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in first."), { status: 401 });
  }
  if (!TestPaymentDriver.available()) {
    return NextResponse.json(errBody("BAD_REQUEST", "Test billing is disabled."), { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["session", "action"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.session !== "string" || (body.action !== "pay" && body.action !== "cancel")) {
    const e = new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (body.action === "cancel") {
    return NextResponse.json({ success: true, data: { abandoned: true } });
  }
  const now = Date.now();
  const payload = JSON.stringify({
    id: `test_evt_${body.session}`,
    kind: "subscription.activated",
    userId: user.id,
    subscriptionId: `test_sub_${body.session}`,
    periodStart: now,
    periodEnd: now + 30 * 24 * 3600 * 1000,
  });
  const driver = new TestPaymentDriver();
  const event = await driver.verifyWebhook(payload, driver.sign(payload));
  const outcome = await applyPaymentEvent(event, "test");
  return NextResponse.json({ success: true, data: { outcome } });
}
