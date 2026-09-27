import Stripe from "stripe";
import { env } from "@/lib/config/env";
import type { NormalizedPaymentEvent, PaymentDriver } from "./payment";
import type { SubscriptionStatus } from "@/lib/accounts/types";

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "EXPIRED";
  }
}

function toMs(v: number | null | undefined): number | undefined {
  return typeof v === "number" ? v * 1000 : undefined;
}

/**
 * Stripe driver. Card data, retries, and tax live at Stripe; we only store
 * subscription state delivered by verified webhooks. Never test with live keys.
 */
export class StripePaymentDriver implements PaymentDriver {
  readonly id = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey?: string) {
    const key = secretKey ?? env.stripeSecretKey;
    if (!key) throw new Error("STRIPE_SECRET_KEY is required for the stripe driver");
    this.stripe = new Stripe(key);
  }

  async createCheckout(input: { userId: string; email: string; successUrl: string; cancelUrl: string }): Promise<{ url: string; externalSessionId?: string }> {
    if (!env.stripePricePremium) throw new Error("STRIPE_PRICE_PREMIUM is not configured");
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.email,
      line_items: [{ price: env.stripePricePremium, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { userId: input.userId, planId: "premium" },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, externalSessionId: session.id };
  }

  async cancelSubscription(externalSubscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(externalSubscriptionId, { cancel_at_period_end: true });
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent> {
    if (!env.stripeWebhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
    const type = event.type;
    if (type === "invoice.payment_failed") {
      // Invoices carry no subscription object: resolve it to find our user.
      // Never throws — worst case the event applies without a user link.
      // (Read defensively: SDK/API versions differ on invoice fields.)
      const inv = event.data.object as unknown as { subscription?: string | { id?: string } | null };
      const sub = inv.subscription;
      const subId = typeof sub === "string" ? sub : sub?.id;
      let userId: string | undefined;
      if (subId) {
        try {
          const sub = await this.stripe.subscriptions.retrieve(subId);
          userId = sub.metadata?.userId as string | undefined;
        } catch {
          // fall through with userId undefined; route resolves via ledger
        }
      }
      return {
        id: event.id,
        type: "payment.failed",
        userId,
        externalSubscriptionId: subId,
        planId: "premium",
        status: "PAST_DUE",
      };
    }
    if (
      type === "checkout.session.completed" ||
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    ) {
      const obj = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
      const sub = await this.resolveSubscription(obj);
      const status = mapStatus(sub.status);
      // SDK versions differ on period field names — read defensively.
      const period = sub as unknown as { current_period_start?: number; current_period_end?: number };
      const canceled = type === "customer.subscription.deleted" || status === "CANCELED" || status === "EXPIRED";
      return {
        id: event.id,
        type: canceled
          ? "subscription.canceled"
          : type === "customer.subscription.updated"
            ? "subscription.updated"
            : "subscription.activated",
        userId: (sub.metadata?.userId as string | undefined) ?? ((obj as Stripe.Checkout.Session).metadata?.userId as string | undefined),
        externalCustomerId: (typeof sub.customer === "string" ? sub.customer : sub.customer?.id) ?? undefined,
        externalSubscriptionId: sub.id,
        planId: "premium",
        status,
        periodStart: toMs(period.current_period_start),
        periodEnd: toMs(period.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    }
    throw new Error(`Unhandled event type: ${type}`);
  }

  private async resolveSubscription(obj: Stripe.Checkout.Session | Stripe.Subscription): Promise<Stripe.Subscription> {
    if ((obj as Stripe.Subscription).object === "subscription") {
      return obj as Stripe.Subscription;
    }
    const session = obj as Stripe.Checkout.Session;
    const subId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subId) throw new Error("Checkout session has no subscription");
    return this.stripe.subscriptions.retrieve(subId);
  }
}
