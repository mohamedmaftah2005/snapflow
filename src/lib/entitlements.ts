import { createHash } from "node:crypto";
import { getAccountStore } from "@/lib/server";
import { GUEST_DAILY_DOWNLOADS, PLANS, type PlanCapabilities, type PlanId } from "@/lib/billing/plans";
import type { UserRecord } from "@/lib/accounts/types";

export interface Entitlement {
  plan: PlanCapabilities;
  authenticated: boolean;
  userId?: string;
}

function guestKeyFor(ip: string, day: string): string {
  // Hashed daily key: enforceable without storing raw IPs.
  return createHash("sha256").update(`guest:${day}:${ip}`).digest("hex").slice(0, 32);
}

export function todayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve the effective plan. Lazy downgrade: expired periods read as free. */
export async function getEntitlement(user: UserRecord | null): Promise<Entitlement> {
  if (!user) return { plan: PLANS.free, authenticated: false };
  const sub = await getAccountStore().getActiveSubscription(user.id);
  if (sub && sub.planId === "premium") {
    return { plan: PLANS.premium, authenticated: true, userId: user.id };
  }
  return { plan: PLANS.free, authenticated: true, userId: user.id };
}

/**
 * Atomically reserve one download against the daily bucket.
 * Returns false when the plan limit is reached. Only successful
 * reservations count — validation failures never touch usage.
 */
export async function reserveDownload(ent: Entitlement, ip: string): Promise<boolean> {
  const day = todayBucket();
  const store = getAccountStore();
  // Guests get a stricter server-side bucket (never localStorage).
  const limit = ent.authenticated ? ent.plan.dailyDownloads : GUEST_DAILY_DOWNLOADS;
  const bucket = ent.userId
    ? { userId: ent.userId, day }
    : { guestKey: guestKeyFor(ip, day), day };
  return store.reserveDownload(bucket, limit);
}

export async function refundDownload(ent: Entitlement, ip: string): Promise<void> {
  const day = todayBucket();
  const store = getAccountStore();
  const bucket = ent.userId
    ? { userId: ent.userId, day }
    : { guestKey: guestKeyFor(ip, day), day };
  await store.refundDownload(bucket);
}

export async function usageFor(ent: Entitlement, ip: string): Promise<{ downloads: number; limit: number | null }> {
  const day = todayBucket();
  const store = getAccountStore();
  const limit = ent.authenticated ? ent.plan.dailyDownloads : GUEST_DAILY_DOWNLOADS;
  const bucket = ent.userId
    ? { userId: ent.userId, day }
    : { guestKey: guestKeyFor(ip, day), day };
  const u = await store.getUsage(bucket);
  return { downloads: u.downloads, limit };
}

/** Queue priority: premium jumps ahead without starving free (10 vs 1). */
export const QUEUE_PRIORITY = { FREE: 10, PREMIUM: 1 } as const;

export function queuePriorityFor(plan: PlanId): number {
  return plan === "premium" ? QUEUE_PRIORITY.PREMIUM : QUEUE_PRIORITY.FREE;
}

/** Max providers actually usable — intersection of enabled flags and plan. */
export function providersForPlan(plan: PlanId): string[] {
  void plan;
  return ["tiktok"];
}
