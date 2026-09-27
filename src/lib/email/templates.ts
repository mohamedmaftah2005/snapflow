import { env } from "@/lib/config/env";

/** Controlled plain-text templates. No secrets, no HTML injection surface. */
export function welcomeEmail(name: string | undefined, verifyUrl: string): { subject: string; text: string } {
  return {
    subject: "Welcome to SnapFlow",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      "Your account is ready. Verify your email to unlock your dashboard history:",
      verifyUrl,
      "",
      "Paste any public TikTok link on the homepage to start downloading.",
      "",
      "— SnapFlow",
    ].join("\n"),
  };
}

export function referralRewardEmail(name: string | undefined, days: number): { subject: string; text: string } {
  return {
    subject: "You earned Premium — thanks for sharing SnapFlow",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      `Someone you referred just saved their first download. We've added ${days} days of Premium to your account — no action needed.`,
      "",
      "— SnapFlow",
    ].join("\n"),
  };
}

export function affiliateApprovedEmail(name: string | undefined, code: string, base: string): { subject: string; text: string } {
  return {
    subject: "Your SnapFlow affiliate application was approved",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      "Your affiliate account is active. Your tracking link:",
      `${base}/?aff=${code}`,
      "",
      "You earn commission on Premium subscriptions from your referrals.",
      "",
      "— SnapFlow",
    ].join("\n"),
  };
}

export function paymentFailedEmail(name: string | undefined): { subject: string; text: string } {
  return {
    subject: "Your SnapFlow payment could not be processed",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      "Your latest payment could not be processed. Your downloads keep working on the Free plan in the meantime.",
      "Update your payment method with our payment provider to restore Premium — nothing is charged automatically beyond your subscription.",
      "",
      "— SnapFlow",
    ].join("\n"),
  };
}

export function subscriptionStartedEmail(name: string | undefined): { subject: string; text: string } {
  return {
    subject: "Welcome to SnapFlow Premium",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      "Your Premium subscription is active: higher daily limits, priority queueing, and larger files.",
      "Manage or cancel anytime from Dashboard → Billing.",
      "",
      "— SnapFlow",
    ].join("\n"),
  };
}

export function subscriptionCanceledEmail(name: string | undefined, periodEnd: string | null): { subject: string; text: string } {
  return {
    subject: "Your SnapFlow Premium ends soon",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      `Your Premium access continues until ${periodEnd ?? "the end of the paid period"}, then returns to Free automatically. Nothing further is charged.`,
      "Changed your mind? Resubscribe anytime from the pricing page.",
      "",
      "— SnapFlow",
    ].join("\n"),
  };
}

export function appBaseUrl(): string {
  return env.appUrl;
}
