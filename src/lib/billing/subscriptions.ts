import { newId } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { logger } from "@/lib/logger";
import type { NormalizedPaymentEvent } from "@/lib/billing/payment";

/**
 * Applies a verified payment event to local subscription state inside one
 * upsert. Returns "duplicate" when the event was already processed.
 */
export async function applyPaymentEvent(
  event: NormalizedPaymentEvent,
  provider: string
): Promise<"applied" | "duplicate" | "ignored"> {
  const store = getAccountStore();
  const first = await store.recordWebhookEvent({ id: event.id, provider, type: event.type });
  if (!first) {
    logger.info("webhook_duplicate", { event: event.id });
    return "duplicate";
  }
  try {
    let userId = event.userId;
    if (!userId && event.externalSubscriptionId) {
      userId = (await store.getSubscriptionByExternal(event.externalSubscriptionId))?.userId;
    }
    if (!userId) {
      await store.markWebhookEvent(event.id, "FAILED", "No user for event");
      return "ignored";
    }
    // Failed payments never rewrite subscription state (period data lives
    // on the row); they only trigger the dunning email + notification.
    if (event.type === "payment.failed") {
      await store.markWebhookEvent(event.id, "PROCESSED");
      try {
        const { lifecycleEvent } = await import("@/lib/growth/lifecycle");
        await lifecycleEvent({ kind: "PAYMENT_FAILED", userId });
      } catch {
        // growth side-effects must never fail webhook processing
      }
      logger.info("payment_failed", { user: userId });
      return "applied";
    }
    const now = Date.now();
    await store.upsertSubscription({
      id: event.externalSubscriptionId ? `sub_${event.externalSubscriptionId}` : newId("sub"),
      userId,
      planId: event.planId,
      provider: provider as "stripe" | "test",
      externalCustomerId: event.externalCustomerId,
      externalSubscriptionId: event.externalSubscriptionId,
      status: event.status,
      currentPeriodStart: event.periodStart,
      currentPeriodEnd: event.periodEnd,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
      createdAt: now,
      updatedAt: now,
    });
    await store.markWebhookEvent(event.id, "PROCESSED");
    logger.info("subscription_updated", { user: userId, plan: event.planId, status: event.status });
    // Growth side-effects (best-effort, never fail the webhook):
    // affiliate conversion on activation, lifecycle + notifications.
    try {
      const { getGrowthStore } = await import("@/lib/server");
      const { lifecycleEvent } = await import("@/lib/growth/lifecycle");
      const growth = getGrowthStore();
      if ((event.type === "subscription.activated" || event.type === "subscription.updated") && (event.status === "ACTIVE" || event.status === "TRIALING")) {
        const pending = await growth.getReferralByReferred(userId).catch(() => undefined);
        const affLink = pending && pending.status === "PENDING" ? await growth.getAffiliateById(pending.referralCodeId).catch(() => undefined) : undefined;
        if (affLink && affLink.status === "ACTIVE") {
          const { recordConversion } = await import("@/lib/growth/affiliates");
          // Amount unknown here (test/Stripe-agnostic): derive from plan price config.
          const { PREMIUM_MONTHLY_CENTS } = await import("@/lib/growth/affiliates");
          await recordConversion({
            affiliateId: affLink.id,
            userId,
            subscriptionId: event.externalSubscriptionId ?? `sub_${event.id}`,
            amountCents: PREMIUM_MONTHLY_CENTS,
          }).catch(() => undefined);
          await growth.setReferralStatus(pending!.id, "QUALIFIED").catch(() => undefined);
        }
        await lifecycleEvent({ kind: "PREMIUM_STARTED", userId });
      }
      if (event.type === "subscription.canceled") {
        await lifecycleEvent({
          kind: "PREMIUM_CANCELED",
          userId,
          periodEnd: event.periodEnd ? new Date(event.periodEnd).toISOString().slice(0, 10) : null,
        });
        if (event.externalSubscriptionId) {
          const { reverseCommission } = await import("@/lib/growth/affiliates");
          await reverseCommission(event.externalSubscriptionId, "subscription canceled").catch(() => undefined);
        }
      }
    } catch {
      // growth side-effects must never fail webhook processing
    }
    return "applied";
  } catch (err) {
    await store.markWebhookEvent(event.id, "FAILED", String(err).slice(0, 300));
    throw err;
  }
}
