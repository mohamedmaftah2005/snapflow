import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { billingEnabled, getPaymentDriver } from "@/lib/billing/driver";
import { applyPaymentEvent } from "@/lib/billing/subscriptions";
import { logger } from "@/lib/logger";
import { reportError } from "@/lib/error-monitoring";

/**
 * Payment webhooks. The provider signature is authoritative — never trust
 * a bare "payment successful" POST. Processing is idempotent via the
 * webhook_events ledger (replays return success without re-applying).
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!env.enableBilling || !billingEnabled()) {
    return NextResponse.json({ success: false, error: { code: "BAD_REQUEST", message: "Billing disabled." } }, { status: 503 });
  }
  const rawBody = await req.text();
  if (!rawBody || rawBody.length > 1_000_000) {
    return NextResponse.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid payload." } }, { status: 400 });
  }
  let event;
  try {
    const driver = getPaymentDriver();
    const signature =
      env.billingProvider === "stripe"
        ? (req.headers.get("stripe-signature") ?? "")
        : (req.headers.get("x-test-signature") ?? "");
    event = await driver.verifyWebhook(rawBody, signature);
  } catch (err) {
    // Forged or malformed — log minimally, reveal nothing.
    logger.warn("webhook_rejected", { reason: String(err).slice(0, 120) });
    return NextResponse.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid signature." } }, { status: 400 });
  }
  try {
    await applyPaymentEvent(event, env.billingProvider as string);
    return NextResponse.json({ success: true, data: {} });
  } catch (err) {
    reportError(err, { route: "webhook" });
    // 500 so the provider retries; ledger prevents double-apply on redelivery.
    return NextResponse.json({ success: false, error: { code: "PROCESSING_FAILED", message: "Retry later." } }, { status: 500 });
  }
}
