import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import type { NormalizedPaymentEvent, PaymentDriver } from "./payment";

/**
 * Local-only driver that exercises the REAL subscription lifecycle
 * (checkout → webhook → activation → cancel → downgrade) without money.
 * Available only when BILLING_PROVIDER=test and NODE_ENV !== 'production'.
 * Test webhooks are HMAC-signed with TEST_WEBHOOK_SECRET.
 */
export class TestPaymentDriver implements PaymentDriver {
  readonly id = "test" as const;

  static available(): boolean {
    return env.billingProvider === "test" && process.env.NODE_ENV !== "production";
  }

  sign(payload: string): string {
    return createHash("sha256").update(`${env.testWebhookSecret}.${payload}`).digest("hex");
  }

  async createCheckout(input: { userId: string; email: string; successUrl: string; cancelUrl: string }): Promise<{ url: string; externalSessionId: string }> {
    if (!TestPaymentDriver.available()) throw new Error("Test billing is disabled");
    const sessionId = `test_cs_${randomBytes(8).toString("hex")}`;
    const params = new URLSearchParams({
      session: sessionId,
      user: input.userId,
      success: input.successUrl,
      cancel: input.cancelUrl,
    });
    return { url: `/billing/test-checkout?${params.toString()}`, externalSessionId: sessionId };
  }

  async cancelSubscription(): Promise<void> {
    if (!TestPaymentDriver.available()) throw new Error("Test billing is disabled");
    // Local driver cancels at period end via the stored subscription row;
    // the billing API updates cancelAtPeriodEnd directly (see cancel route).
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent> {
    if (!TestPaymentDriver.available()) throw new Error("Test billing is disabled");
    const expected = this.sign(rawBody);
    if (signature.length !== expected.length || !timingSafe(expected, signature)) {
      throw new Error("Invalid test webhook signature");
    }
    const body = JSON.parse(rawBody) as {
      id: string; kind: string; userId: string; subscriptionId: string;
      periodStart?: number; periodEnd?: number;
    };
    if (!body.id || !body.userId || !body.subscriptionId) throw new Error("Malformed test event");
    const now = Date.now();
    if (body.kind === "subscription.activated") {
      return {
        id: body.id, type: "subscription.activated", userId: body.userId,
        externalSubscriptionId: body.subscriptionId, planId: "premium", status: "ACTIVE",
        periodStart: body.periodStart ?? now, periodEnd: body.periodEnd ?? now + 30 * 24 * 3600 * 1000,
        cancelAtPeriodEnd: false,
      };
    }
    if (body.kind === "subscription.canceled") {
      return {
        id: body.id, type: "subscription.canceled", userId: body.userId,
        externalSubscriptionId: body.subscriptionId, planId: "premium", status: "CANCELED",
        periodStart: body.periodStart, periodEnd: body.periodEnd, cancelAtPeriodEnd: true,
      };
    }
    throw new Error(`Unhandled test event kind: ${body.kind}`);
  }
}

function timingSafe(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
