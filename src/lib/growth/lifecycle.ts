import { getAccountStore } from "@/lib/server";
import { getEmailService } from "@/lib/email";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import { notify } from "@/lib/growth/notifications";
import { queueEmail } from "@/lib/growth/email-outbox";
import {
  appBaseUrl,
  paymentFailedEmail,
  referralRewardEmail,
  subscriptionCanceledEmail,
  subscriptionStartedEmail,
  welcomeEmail,
} from "@/lib/email/templates";

async function userContact(userId: string): Promise<{ email: string; name?: string } | null> {
  const row = await getAccountStore().getUserById(userId);
  if (!row || row.status !== "ACTIVE") return null;
  return { email: row.email, name: row.name };
}

/**
 * Central lifecycle dispatcher. Event-driven only (no scheduler in MVP —
 * time-based reactivation is documented as future work in docs/growth.md).
 * Every branch is idempotent and failure-isolated.
 */
export async function lifecycleEvent(
  event:
    | { kind: "USER_REGISTERED"; userId: string; verifyToken: string }
    | { kind: "FIRST_DOWNLOAD_COMPLETED"; userId: string; title: string }
    | { kind: "PREMIUM_STARTED"; userId: string }
    | { kind: "PREMIUM_CANCELED"; userId: string; periodEnd: string | null }
    | { kind: "PAYMENT_FAILED"; userId: string }
    | { kind: "REFERRAL_REWARDED"; userId: string; days: number }
): Promise<void> {
  try {
    switch (event.kind) {
      case "USER_REGISTERED": {
        const contact = await userContact(event.userId);
        if (!contact) return;
        const tpl = welcomeEmail(contact.name, `${appBaseUrl()}/verify?token=${event.verifyToken}`);
        await queueEmail({ userId: event.userId, to: contact.email, ...tpl });
        break;
      }
      case "FIRST_DOWNLOAD_COMPLETED": {
        inc("activation_first_download_total");
        logger.info("activation", { user: event.userId });
        break;
      }
      case "PREMIUM_STARTED": {
        const contact = await userContact(event.userId);
        if (!contact) return;
        const tpl = subscriptionStartedEmail(contact.name);
        await queueEmail({ userId: event.userId, to: contact.email, ...tpl });
        await notify(event.userId, "subscription.started", {
          title: "Premium is active",
          body: "Higher limits and priority queueing are now on.",
          link: "/dashboard/billing",
        });
        break;
      }
      case "PREMIUM_CANCELED": {
        const contact = await userContact(event.userId);
        if (!contact) return;
        const tpl = subscriptionCanceledEmail(contact.name, event.periodEnd);
        await queueEmail({ userId: event.userId, to: contact.email, ...tpl });
        break;
      }
      case "PAYMENT_FAILED": {
        const contact = await userContact(event.userId);
        if (!contact) return;
        const tpl = paymentFailedEmail(contact.name);
        await queueEmail({ userId: event.userId, to: contact.email, ...tpl });
        await notify(event.userId, "payment.failed", {
          title: "Payment could not be processed",
          body: "Your downloads keep working on Free. Update billing to restore Premium.",
          link: "/dashboard/billing",
        });
        break;
      }
      case "REFERRAL_REWARDED": {
        const contact = await userContact(event.userId);
        if (!contact) return;
        const tpl = referralRewardEmail(contact.name, event.days);
        await queueEmail({ userId: event.userId, to: contact.email, ...tpl });
        await notify(event.userId, "referral.rewarded", {
          title: "Referral reward earned",
          body: `A referral earned you ${event.days} days of Premium.`,
          link: "/dashboard/referrals",
        });
        break;
      }
    }
  } catch (err) {
    // Lifecycle must never break core flows.
    logger.error("lifecycle_failed", { kind: event.kind, message: String(err).slice(0, 200) });
  }
}

export function downloadCompletedNotify(userId: string | undefined, title: string): Promise<boolean> {
  if (!userId) return Promise.resolve(false);
  return notify(userId, "download.completed", {
    title: "Download ready",
    body: `"${title.slice(0, 120)}" finished — open your dashboard before it expires.`,
    link: "/dashboard/history",
  });
}

export function affiliateApprovedNotify(userId: string, code: string): Promise<boolean> {
  return notify(userId, "affiliate.approved", {
    title: "Affiliate approved",
    body: `Your tracking link is live: ${appBaseUrl()}/?aff=${code}`,
    link: "/dashboard/affiliate",
  }).then(async (ok) => {
    const contact = await userContact(userId);
    if (ok && contact) {
      const { affiliateApprovedEmail } = await import("@/lib/email/templates");
      const tpl = affiliateApprovedEmail(contact.name, code, appBaseUrl());
      await queueEmail({ userId, to: contact.email, ...tpl });
    }
    return ok;
  });
}
