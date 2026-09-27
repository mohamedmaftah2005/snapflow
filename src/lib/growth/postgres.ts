import { Pool } from "pg";
import { createPool } from "@/lib/db/pool";
import type {
  AffiliateRecord, AffiliateStatus, CampaignRecord, CommissionRecord, EmailLogRecord,
  GrowthStore, NotificationPreferences, NotificationRecord, PayoutRecord,
  ReferralCodeRecord, ReferralRecord, ReferralStatus,
} from "./types";

const t = (v: unknown): number | undefined => (v ? new Date(v as string).getTime() : undefined);

export class PostgresGrowthStore implements GrowthStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = createPool(connectionString, { name: "growth", max: 3 });
  }

  async createReferralCode(r: ReferralCodeRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO referral_codes (id, user_id, code, active, created_at) VALUES ($1,$2,$3,$4,to_timestamp($5/1000.0))",
      [r.id, r.userId, r.code, r.active, r.createdAt]
    );
  }

  async getReferralCode(code: string): Promise<ReferralCodeRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM referral_codes WHERE code = $1", [code]);
    if (!r.rowCount) return undefined;
    const row = r.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id), userId: String(row.user_id), code: String(row.code),
      active: Boolean(row.active), createdAt: new Date(row.created_at as string).getTime(),
    };
  }

  async listReferralCodes(userId: string): Promise<ReferralCodeRecord[]> {
    const r = await this.pool.query("SELECT * FROM referral_codes WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return (r.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), userId: String(row.user_id), code: String(row.code),
      active: Boolean(row.active), createdAt: new Date(row.created_at as string).getTime(),
    }));
  }

  async setReferralCodeActive(id: string, active: boolean): Promise<void> {
    await this.pool.query("UPDATE referral_codes SET active = $2 WHERE id = $1", [id, active]);
  }

  async createReferral(r: ReferralRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO referrals (id, referrer_user_id, referred_user_id, referral_code_id, status, created_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0))",
      [r.id, r.referrerUserId, r.referredUserId, r.referralCodeId, r.status, r.createdAt]
    );
  }

  async getReferralByReferred(referredUserId: string): Promise<ReferralRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM referrals WHERE referred_user_id = $1", [referredUserId]);
    return r.rowCount ? toReferral(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async listReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]> {
    const r = await this.pool.query(
      "SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC", [referrerUserId]
    );
    return (r.rows as Record<string, unknown>[]).map(toReferral);
  }

  async transitionReferral(id: string, from: ReferralStatus[], to: ReferralStatus): Promise<boolean> {
    const r = await this.pool.query(
      "UPDATE referrals SET status = $3 WHERE id = $1 AND status = ANY($2)",
      [id, from, to]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async setReferralStatus(id: string, to: ReferralStatus): Promise<void> {
    await this.pool.query("UPDATE referrals SET status = $2 WHERE id = $1", [id, to]);
  }

  async countRewarded(referrerUserId: string): Promise<number> {
    const r = await this.pool.query(
      "SELECT COUNT(*)::int AS n FROM referrals WHERE referrer_user_id = $1 AND status = 'REWARDED'",
      [referrerUserId]
    );
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async createAffiliate(r: AffiliateRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO affiliates (id, user_id, code, status, commission_rate, created_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0))",
      [r.id, r.userId, r.code, r.status, r.commissionRate, r.createdAt]
    );
  }

  async getAffiliateByUser(userId: string): Promise<AffiliateRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM affiliates WHERE user_id = $1", [userId]);
    return r.rowCount ? toAffiliate(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async getAffiliateByCode(code: string): Promise<AffiliateRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM affiliates WHERE code = $1", [code]);
    return r.rowCount ? toAffiliate(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async getAffiliateById(id: string): Promise<AffiliateRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM affiliates WHERE id = $1", [id]);
    return r.rowCount ? toAffiliate(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async listAffiliates(status?: AffiliateStatus, limit = 50): Promise<AffiliateRecord[]> {
    const r = status
      ? await this.pool.query("SELECT * FROM affiliates WHERE status = $1 ORDER BY created_at DESC LIMIT $2", [status, limit])
      : await this.pool.query("SELECT * FROM affiliates ORDER BY created_at DESC LIMIT $1", [limit]);
    return (r.rows as Record<string, unknown>[]).map(toAffiliate);
  }

  async updateAffiliate(id: string, patch: Partial<AffiliateRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [id];
    let i = 2;
    if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status); }
    if (patch.commissionRate !== undefined) { sets.push(`commission_rate = $${i++}`); vals.push(patch.commissionRate); }
    if (sets.length === 0) return;
    await this.pool.query(`UPDATE affiliates SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  async createCommission(r: CommissionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO affiliate_commissions (id, affiliate_id, user_id, subscription_id, amount_cents, currency, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0))`,
      [r.id, r.affiliateId, r.userId, r.subscriptionId ?? null, r.amountCents, r.currency, r.status, r.createdAt]
    );
  }

  async getCommissionBySubscription(subscriptionId: string): Promise<CommissionRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM affiliate_commissions WHERE subscription_id = $1", [subscriptionId]);
    return r.rowCount ? toCommission(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async listCommissions(affiliateId: string): Promise<CommissionRecord[]> {
    const r = await this.pool.query(
      "SELECT * FROM affiliate_commissions WHERE affiliate_id = $1 ORDER BY created_at DESC", [affiliateId]
    );
    return (r.rows as Record<string, unknown>[]).map(toCommission);
  }

  async setCommissionStatus(id: string, to: CommissionRecord["status"]): Promise<void> {
    await this.pool.query("UPDATE affiliate_commissions SET status = $2 WHERE id = $1", [id, to]);
  }

  async createPayout(r: PayoutRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO affiliate_payouts (id, affiliate_id, amount_cents, currency, status, created_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0))",
      [r.id, r.affiliateId, r.amountCents, r.currency, r.status, r.createdAt]
    );
  }

  async listPayouts(affiliateId: string): Promise<PayoutRecord[]> {
    const r = await this.pool.query(
      "SELECT * FROM affiliate_payouts WHERE affiliate_id = $1 ORDER BY created_at DESC", [affiliateId]
    );
    return (r.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      affiliateId: String(row.affiliate_id),
      amountCents: Number(row.amount_cents),
      currency: String(row.currency),
      status: row.status as PayoutRecord["status"],
      createdAt: new Date(row.created_at as string).getTime(),
    }));
  }

  async setPayoutStatus(id: string, to: PayoutRecord["status"]): Promise<void> {
    await this.pool.query("UPDATE affiliate_payouts SET status = $2 WHERE id = $1", [id, to]);
  }

  async createNotification(r: NotificationRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))",
      [r.id, r.userId, r.type, r.title, r.body, r.link ?? null, r.createdAt]
    );
  }

  async listNotifications(userId: string, limit: number): Promise<NotificationRecord[]> {
    const r = await this.pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2", [userId, limit]
    );
    return (r.rows as Record<string, unknown>[]).map(toNotification);
  }

  async countUnread(userId: string): Promise<number> {
    const r = await this.pool.query(
      "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId]
    );
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const r = await this.pool.query(
      "UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [id, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const r = await this.pool.query(
      "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]
    );
    return r.rowCount ?? 0;
  }

  async deleteNotificationsForUser(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM notification_preferences WHERE user_id = $1", [userId]);
  }

  async purgeNotifications(beforeMs: number, limit: number): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM notifications WHERE id IN (
         SELECT id FROM notifications WHERE created_at < to_timestamp($1/1000.0)
         ORDER BY created_at ASC LIMIT $2
       )`,
      [beforeMs, limit]
    );
    return r.rowCount ?? 0;
  }

  async getPreferences(userId: string): Promise<import("./types").NotificationPreferences> {
    const r = await this.pool.query("SELECT * FROM notification_preferences WHERE user_id = $1", [userId]);
    if (!r.rowCount) {
      return { marketingEmailOptIn: false, downloadNotify: true, referralNotify: true, affiliateNotify: true };
    }
    const row = r.rows[0] as Record<string, unknown>;
    return {
      marketingEmailOptIn: Boolean(row.marketing_email_opt_in),
      downloadNotify: Boolean(row.download_notify),
      referralNotify: Boolean(row.referral_notify),
      affiliateNotify: Boolean(row.affiliate_notify),
    };
  }

  async setPreferences(userId: string, p: Partial<import("./types").NotificationPreferences>): Promise<import("./types").NotificationPreferences> {
    const cur = await this.getPreferences(userId);
    const next = { ...cur, ...p };
    await this.pool.query(
      `INSERT INTO notification_preferences (user_id, marketing_email_opt_in, download_notify, referral_notify, affiliate_notify, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (user_id) DO UPDATE SET
         marketing_email_opt_in = EXCLUDED.marketing_email_opt_in,
         download_notify = EXCLUDED.download_notify,
         referral_notify = EXCLUDED.referral_notify,
         affiliate_notify = EXCLUDED.affiliate_notify,
         updated_at = now()`,
      [userId, next.marketingEmailOptIn, next.downloadNotify, next.referralNotify, next.affiliateNotify]
    );
    return next;
  }

  async deletePreferences(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM notification_preferences WHERE user_id = $1", [userId]);
  }

  async logEmail(r: EmailLogRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO email_logs (id, user_id, type, status, error, created_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0))",
      [r.id, r.userId ?? null, r.type, r.status, r.error ?? null, r.createdAt]
    );
  }

  async setEmailStatus(id: string, status: EmailLogRecord["status"], error?: string): Promise<void> {
    await this.pool.query("UPDATE email_logs SET status = $2, error = $3 WHERE id = $1", [id, status, error ?? null]);
  }

  async purgeEmailLogs(beforeMs: number, limit: number): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM email_logs WHERE id IN (
         SELECT id FROM email_logs WHERE created_at < to_timestamp($1/1000.0)
         ORDER BY created_at ASC LIMIT $2
       )`,
      [beforeMs, limit]
    );
    return r.rowCount ?? 0;
  }

  async createCampaign(r: CampaignRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO campaigns (id, name, type, status, audience, subject, body, starts_at, ends_at, sent_count, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0),$10,$11,to_timestamp($12/1000.0))`,
      [r.id, r.name, r.type, r.status, r.audience, r.subject, r.body,
       r.startsAt ?? null, r.endsAt ?? null, r.sentCount, r.createdBy ?? null, r.createdAt]
    );
  }

  async getCampaign(id: string): Promise<CampaignRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM campaigns WHERE id = $1", [id]);
    return r.rowCount ? toCampaign(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    const r = await this.pool.query("SELECT * FROM campaigns ORDER BY created_at DESC");
    return (r.rows as Record<string, unknown>[]).map(toCampaign);
  }

  async updateCampaign(id: string, patch: Partial<CampaignRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [id];
    let i = 2;
    if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status); }
    if (patch.sentCount !== undefined) { sets.push(`sent_count = $${i++}`); vals.push(patch.sentCount); }
    if (sets.length === 0) return;
    await this.pool.query(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function toReferral(row: Record<string, unknown>): import("./types").ReferralRecord {
  return {
    id: String(row.id),
    referrerUserId: String(row.referrer_user_id),
    referredUserId: String(row.referred_user_id),
    referralCodeId: String(row.referral_code_id),
    status: row.status as import("./types").ReferralRecord["status"],
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

function toAffiliate(row: Record<string, unknown>): import("./types").AffiliateRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    code: String(row.code),
    status: row.status as import("./types").AffiliateRecord["status"],
    commissionRate: Number(row.commission_rate),
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

function toCommission(row: Record<string, unknown>): import("./types").CommissionRecord {
  return {
    id: String(row.id),
    affiliateId: String(row.affiliate_id),
    userId: String(row.user_id),
    subscriptionId: (row.subscription_id as string | null) ?? undefined,
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    status: row.status as import("./types").CommissionRecord["status"],
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

function toNotification(row: Record<string, unknown>): import("./types").NotificationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    link: (row.link as string | null) ?? undefined,
    readAt: t(row.read_at),
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

function toCampaign(row: Record<string, unknown>): import("./types").CampaignRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as import("./types").CampaignRecord["type"],
    status: row.status as import("./types").CampaignRecord["status"],
    audience: String(row.audience),
    subject: String(row.subject),
    body: String(row.body),
    startsAt: t(row.starts_at),
    endsAt: t(row.ends_at),
    sentCount: Number(row.sent_count ?? 0),
    createdBy: (row.created_by as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}
