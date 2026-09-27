import { randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { getAccountStore, getGrowthStore } from "@/lib/server";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import type { AffiliateStatus, CommissionStatus } from "@/lib/growth/types";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function newCode(): string {
  return `aff_${randomBytes(6).toString("base64url")}`;
}

/** Premium monthly price in cents (matches /pricing). Single source for commissions. */
export const PREMIUM_MONTHLY_CENTS = 500;

/** User applies; status PENDING until an admin approves. */
export async function applyForAffiliate(userId: string): Promise<{ id: string; code: string; status: AffiliateStatus }> {
  const store = getGrowthStore();
  const existing = await store.getAffiliateByUser(userId);
  if (existing) return { id: existing.id, code: existing.code, status: existing.status };
  const rec = {
    id: newId("aff"),
    userId,
    code: newCode(),
    status: "PENDING" as AffiliateStatus,
    commissionRate: env.affiliateCommissionRate,
    createdAt: Date.now(),
  };
  await store.createAffiliate(rec);
  logger.info("affiliate_applied", { user: userId });
  return { id: rec.id, code: rec.code, status: rec.status };
}

/**
 * Record a premium conversion for an affiliate-linked signup. Idempotent:
 * one commission per subscription id; replays return the existing row.
 * Only APPROVED once (qualification period = immediate for MVP, documented).
 */
export async function recordConversion(params: {
  affiliateId: string;
  userId: string;
  subscriptionId: string;
  amountCents: number;
}): Promise<{ id: string; duplicate: boolean }> {
  const store = getGrowthStore();
  const existing = await store.getCommissionBySubscription(params.subscriptionId);
  if (existing) return { id: existing.id, duplicate: true };
  const aff = await store.getAffiliateById(params.affiliateId);
  if (!aff || aff.status !== "ACTIVE") {
    throw new Error("Affiliate is not active");
  }
  const id = newId("com");
  await store.createCommission({
    id,
    affiliateId: params.affiliateId,
    userId: params.userId,
    subscriptionId: params.subscriptionId,
    amountCents: Math.round(params.amountCents * aff.commissionRate),
    currency: "USD",
    status: "APPROVED",
    createdAt: Date.now(),
  });
  logger.info("affiliate_conversion", { affiliate: params.affiliateId });
  inc("affiliate_conversion_total");
  return { id, duplicate: false };
}

/** Refund/cancel of the underlying subscription reverses the commission. Ledger kept. */
export async function reverseCommission(subscriptionId: string, reason: string): Promise<boolean> {
  const store = getGrowthStore();
  const existing = await store.getCommissionBySubscription(subscriptionId);
  if (!existing || existing.status === "REVERSED" || existing.status === "PAID") return false;
  await store.setCommissionStatus(existing.id, "REVERSED");
  logger.info("affiliate_commission_reversed", { commission: existing.id, reason });
  return true;
}

export async function affiliateStats(affiliateId: string): Promise<{
  conversions: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  payouts: { id: string; amountCents: number; status: string; createdAt: number }[];
}> {
  const store = getGrowthStore();
  const comms = await store.listCommissions(affiliateId);
  const sum = (s: CommissionStatus): number =>
    comms.filter((c) => c.status === s).reduce((a, c) => a + c.amountCents, 0);
  return {
    conversions: comms.length,
    pendingCents: sum("PENDING"),
    approvedCents: sum("APPROVED"),
    paidCents: sum("PAID"),
    payouts: await store.listPayouts(affiliateId),
  };
}

/** Create a manual payout when the approved balance clears the threshold. */
export async function createPayout(affiliateId: string): Promise<{ id: string; amountCents: number } | null> {
  const store = getGrowthStore();
  const comms = await store.listCommissions(affiliateId);
  const available = comms
    .filter((c) => c.status === "APPROVED")
    .reduce((a, c) => a + c.amountCents, 0);
  if (available < env.minimumPayoutCents) return null;
  const id = newId("pay");
  await store.createPayout({
    id, affiliateId, amountCents: available, currency: "USD",
    status: "PAYOUT_PENDING", createdAt: Date.now(),
  });
  for (const c of comms.filter((c) => c.status === "APPROVED")) {
    await store.setCommissionStatus(c.id, "PAID");
  }
  logger.info("affiliate_payout_created", { affiliate: affiliateId, amountCents: available });
  return { id, amountCents: available };
}

export async function setAffiliateStatus(
  id: string,
  status: AffiliateStatus,
  rate?: number
): Promise<boolean> {
  const store = getGrowthStore();
  const aff = await store.getAffiliateById(id);
  if (!aff) return false;
  await store.updateAffiliate(id, {
    status,
    ...(rate !== undefined ? { commissionRate: Math.min(Math.max(rate, 0), 1) } : {}),
  });
  return true;
}

export function affiliateLink(code: string, base: string): string {
  return `${base}/?aff=${code}`;
}

export function earningsForAdmin(affiliateId: string): ReturnType<typeof affiliateStats> {
  return affiliateStats(affiliateId);
}

export async function adminListAffiliates(status?: AffiliateStatus) {
  const store = getGrowthStore();
  return store.listAffiliates(status);
}
