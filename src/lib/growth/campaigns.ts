import { randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { getAccountStore, getGrowthStore } from "@/lib/server";
import { logger } from "@/lib/logger";
import { queueEmail } from "@/lib/growth/email-outbox";
import type { CampaignRecord } from "@/lib/growth/types";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export const CAMPAIGN_AUDIENCES = [
  "new_users",
  "inactive_users",
  "premium_users",
  "canceled_users",
  "developers",
  "affiliates",
] as const;

export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number];

export function isValidAudience(a: string): a is CampaignAudience {
  return (CAMPAIGN_AUDIENCES as readonly string[]).includes(a);
}

/**
 * Audience resolution uses account state only — never behavioral profiles.
 * inactive_users = registered >30d ago with no completed jobs (bounded scan).
 */
export async function resolveAudience(audience: CampaignAudience, limit: number): Promise<string[]> {
  const store = getGrowthStore();
  const accounts = getAccountStore();
  const { users, total } = await accounts.listUsers({ limit: Math.min(limit * 4, 500), offset: 0 });
  void total;
  const out: string[] = [];
  const now = Date.now();
  for (const u of users) {
    if (out.length >= limit) break;
    if (u.status !== "ACTIVE") continue;
    switch (audience) {
      case "new_users":
        if (now - u.createdAt < 7 * 24 * 3600 * 1000) out.push(u.id);
        break;
      case "inactive_users": {
        if (now - u.createdAt < 30 * 24 * 3600 * 1000) break;
        const { getRepository } = await import("@/lib/server");
        const recent = await getRepository().listByUser(u.id, 1);
        if (recent.length === 0) out.push(u.id);
        break;
      }
      case "premium_users":
      case "canceled_users":
      case "developers":
      case "affiliates":
        // Resolved by the caller from subscription/key/affiliate state.
        break;
    }
  }
  return out;
}

/**
 * Run a campaign once: ACTIVE + in window + frequency-capped marketing send.
 * Content is plain text from controlled templates (no HTML injection).
 */
export async function runCampaign(id: string): Promise<{ sent: number; skipped: number }> {
  const store = getGrowthStore();
  const { isEnabled } = await import("@/lib/admin/flags");
  if (!(await isEnabled("marketing_enabled", true))) {
    throw new Error("Marketing is currently disabled");
  }
  const camp = await store.getCampaign(id);
  if (!camp || camp.status !== "ACTIVE") throw new Error("Campaign is not active");
  const now = Date.now();
  if ((camp.startsAt && now < camp.startsAt) || (camp.endsAt && now > camp.endsAt)) {
    throw new Error("Campaign is outside its window");
  }
  if (!isValidAudience(camp.audience)) throw new Error("Unknown audience");
  const targets = await resolveAudience(camp.audience, 200);
  const accounts = getAccountStore();
  let sent = 0;
  let skipped = 0;
  for (const userId of targets) {
    const row = await accounts.getUserById(userId);
    if (!row) {
      skipped += 1;
      continue;
    }
    try {
      await queueEmail({ userId, to: row.email, subject: camp.subject, text: camp.body, marketing: true });
      sent += 1;
    } catch {
      skipped += 1;
    }
    if (sent >= env.maxMarketingEmails * 50) break; // hard per-run cap
  }
  await store.updateCampaign(id, { sentCount: camp.sentCount + sent });
  logger.info("campaign_run", { campaign: id, sent, skipped });
  return { sent, skipped };
}

export async function createCampaign(input: {
  name: string;
  type: CampaignRecord["type"];
  audience: string;
  subject: string;
  body: string;
  createdBy: string | null;
}): Promise<CampaignRecord> {
  if (!isValidAudience(input.audience)) throw new Error("Unknown audience");
  if (!["win_back", "inactive_nudge", "announcement"].includes(input.type)) {
    throw new Error("Unknown campaign type");
  }
  const rec: CampaignRecord = {
    id: newId("cmp"),
    name: input.name.slice(0, 120),
    type: input.type,
    status: "DRAFT",
    audience: input.audience,
    subject: input.subject.slice(0, 200),
    // Plain text only — no HTML/JS campaigns, ever.
    body: input.body.slice(0, 5000),
    sentCount: 0,
    createdBy: input.createdBy ?? undefined,
    createdAt: Date.now(),
  };
  await getGrowthStore().createCampaign(rec);
  return rec;
}
