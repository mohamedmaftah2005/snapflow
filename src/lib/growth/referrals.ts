import { randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { getAccountStore, getGrowthStore } from "@/lib/server";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import { isValidAttributionCode } from "@/lib/growth/codes";
import type { ReferralStatus } from "@/lib/growth/types";

export { AFF_COOKIE, REF_COOKIE, isValidAttributionCode } from "@/lib/growth/codes";

function newCode(prefix: string): string {
  return `${prefix}${randomBytes(6).toString("base64url")}`;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

/** Attribution precedence: affiliate beats referral; never both. */
export function precedence(attrib: { ref?: string; aff?: string }): { kind: "affiliate" | "referral" | null; code?: string } {
  if (attrib.aff && isValidAttributionCode(attrib.aff)) return { kind: "affiliate", code: attrib.aff };
  if (attrib.ref && isValidAttributionCode(attrib.ref)) return { kind: "referral", code: attrib.ref };
  return { kind: null };
}

/** Get-or-create the user's active referral code (revocable, opaque). */
export async function myReferralCode(userId: string): Promise<{ code: string }> {
  const store = getGrowthStore();
  const existing = (await store.listReferralCodes(userId)).find((c) => c.active);
  if (existing) return { code: existing.code };
  const code = newCode("ref_");
  await store.createReferralCode({ id: newId("rfc"), userId, code, active: true, createdAt: Date.now() });
  return { code };
}

/**
 * Attribute a signup. Guards: code must exist+active, no self-referral,
 * one relationship per referred user, owner must be ACTIVE.
 */
export async function attributeSignup(
  newUserId: string,
  attrib: { ref?: string; aff?: string }
): Promise<{ kind: string } | null> {
  const pick = precedence(attrib);
  if (!pick.kind || !pick.code) return null;
  const store = getGrowthStore();
  const accounts = getAccountStore();
  if (await store.getReferralByReferred(newUserId)) return null; // already attributed

  if (pick.kind === "affiliate") {
    const aff = await store.getAffiliateByCode(pick.code);
    if (!aff || aff.status !== "ACTIVE" || aff.userId === newUserId) return null;
    // Affiliate attribution is recorded at conversion (subscription), not signup.
    // Store the pending link so conversion can find it.
    await store.createReferral({
      id: newId("ref"),
      referrerUserId: aff.userId,
      referredUserId: newUserId,
      referralCodeId: aff.id,
      status: "PENDING",
      createdAt: Date.now(),
    });
    logger.info("affiliate_attributed", { affiliate: aff.id, user: newUserId });
    return { kind: "affiliate" };
  }

  const code = await store.getReferralCode(pick.code);
  if (!code || !code.active) return null;
  if (code.userId === newUserId) return null; // self-referral
  const owner = await accounts.getUserById(code.userId);
  if (!owner || owner.status !== "ACTIVE") return null;
  await store.createReferral({
    id: newId("ref"),
    referrerUserId: code.userId,
    referredUserId: newUserId,
    referralCodeId: code.id,
    status: "PENDING",
    createdAt: Date.now(),
  });
  logger.info("referral_attributed", { referrer: code.userId, user: newUserId });
  inc("referral_signup_total");
  return { kind: "referral" };
}

/**
 * Qualify on first completed download. Idempotent via conditional
 * transition (PENDING→QUALIFIED); the reward step is separate so a retry
 * can never double-award.
 */
export async function maybeQualifyReferral(userId: string): Promise<void> {
  const store = getGrowthStore();
  const rel = await store.getReferralByReferred(userId);
  if (!rel || rel.status !== "PENDING") return;
  // Distinguish affiliate-pending links (referralCodeId is an affiliate id).
  const affiliate = await store.getAffiliateById(rel.referralCodeId).catch(() => undefined);
  if (affiliate) return; // affiliate conversions happen at subscription time
  if (!(await store.transitionReferral(rel.id, ["PENDING"], "QUALIFIED"))) return;
  logger.info("referral_qualified", { referral: rel.id });
  inc("referral_qualified_total");
  await awardReferral(rel);
}

/**
 * Award a 7-day premium trial subscription. Idempotent: the QUALIFIED→
 * REWARDED transition is the claim, the trial row is looked up by a
 * deterministic external id, and rewards are capped per referrer.
 */
export async function awardReferral(referral: {
  id: string;
  referrerUserId: string;
  referredUserId: string;
}): Promise<boolean> {
  const store = getGrowthStore();
  const accounts = getAccountStore();
  // Claim first (atomic per-referral), then enforce the cap strictly:
  // over-cap claims are reversed back to QUALIFIED with no trial.
  if (!(await store.transitionReferral(referral.id, ["QUALIFIED"], "REWARDED"))) return false;
  if ((await store.countRewarded(referral.referrerUserId)) > env.maxReferralRewards) {
    await store.setReferralStatus(referral.id, "QUALIFIED");
    return false;
  }
  const now = Date.now();
  const externalId = `trial_${referral.id}`;
  const existing = await accounts.getSubscriptionByExternal(externalId);
  if (!existing) {
    await accounts.upsertSubscription({
      id: `sub_${referral.id}`,
      userId: referral.referredUserId,
      planId: "premium",
      provider: "test",
      externalSubscriptionId: externalId,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: now + env.referralTrialDays * 24 * 3600 * 1000,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  logger.info("referral_rewarded", { referral: referral.id });
  inc("referral_rewarded_total");
  return true;
}

export async function referralStats(userId: string): Promise<{
  link: string | null;
  pending: number;
  qualified: number;
  rewarded: number;
}> {
  const store = getGrowthStore();
  const codes = await store.listReferralCodes(userId);
  const rels = await store.listReferralsByReferrer(userId);
  const count = (s: ReferralStatus): number => rels.filter((r) => r.status === s).length;
  return {
    link: codes.find((c) => c.active)?.code ?? null,
    pending: count("PENDING"),
    qualified: count("QUALIFIED"),
    rewarded: count("REWARDED"),
  };
}
