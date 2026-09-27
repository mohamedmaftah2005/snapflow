import { randomBytes } from "node:crypto";
import { getGrowthStore } from "@/lib/server";
import { logger } from "@/lib/logger";
import type { NotificationRecord } from "@/lib/growth/types";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export type NotifyKind =
  | "download.completed"
  | "download.failed"
  | "batch.completed"
  | "subscription.started"
  | "subscription.canceled"
  | "payment.failed"
  | "referral.rewarded"
  | "affiliate.approved"
  | "security.alert";

const PREF_KEY: Record<NotifyKind, "downloadNotify" | "referralNotify" | "affiliateNotify" | null> = {
  "download.completed": "downloadNotify",
  "download.failed": "downloadNotify",
  "batch.completed": "downloadNotify",
  "subscription.started": null, // essential billing — always on
  "subscription.canceled": null, // essential billing — always on
  "payment.failed": null, // essential billing — always on
  "referral.rewarded": "referralNotify",
  "affiliate.approved": "affiliateNotify",
  "security.alert": null, // security — always on
};

/**
 * Create an in-app notification honoring user preferences.
 * Transactional/billing/security kinds bypass opt-outs by design.
 */
export async function notify(
  userId: string,
  kind: NotifyKind,
  input: { title: string; body: string; link?: string }
): Promise<boolean> {
  const store = getGrowthStore();
  const prefKey = PREF_KEY[kind];
  if (prefKey) {
    const prefs = await store.getPreferences(userId);
    if (!prefs[prefKey]) return false;
  }
  const record: NotificationRecord = {
    id: newId("ntf"),
    userId,
    type: kind,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 500),
    link: input.link?.slice(0, 300),
    createdAt: Date.now(),
  };
  await store.createNotification(record);
  return true;
}
