import type {
  AffiliateRecord, AffiliateStatus, CampaignRecord, CommissionRecord, EmailLogRecord,
  GrowthStore, NotificationPreferences, NotificationRecord, PayoutRecord, ReferralCodeRecord,
  ReferralRecord, ReferralStatus,
} from "./types";

const DEFAULT_PREFS: NotificationPreferences = {
  marketingEmailOptIn: false,
  downloadNotify: true,
  referralNotify: true,
  affiliateNotify: true,
};

/** In-process store for local dev/tests. Same interface as Postgres. */
export class MemoryGrowthStore implements GrowthStore {
  private codes = new Map<string, ReferralCodeRecord>();
  private codeByCode = new Map<string, string>();
  private referrals = new Map<string, ReferralRecord>();
  private byReferred = new Map<string, string>();
  private affiliates = new Map<string, AffiliateRecord>();
  private affByUser = new Map<string, string>();
  private affByCode = new Map<string, string>();
  private commissions = new Map<string, CommissionRecord>();
  private commBySub = new Map<string, string>();
  private payouts = new Map<string, PayoutRecord[]>();
  private notifications = new Map<string, NotificationRecord[]>();
  private prefs = new Map<string, NotificationPreferences>();
  private emails = new Map<string, EmailLogRecord>();
  private campaigns = new Map<string, CampaignRecord>();

  async createReferralCode(r: ReferralCodeRecord): Promise<void> {
    this.codes.set(r.id, { ...r });
    this.codeByCode.set(r.code, r.id);
  }

  async getReferralCode(code: string): Promise<ReferralCodeRecord | undefined> {
    const id = this.codeByCode.get(code);
    const r = id ? this.codes.get(id) : undefined;
    return r ? { ...r } : undefined;
  }

  async listReferralCodes(userId: string): Promise<ReferralCodeRecord[]> {
    return [...this.codes.values()].filter((c) => c.userId === userId).map((c) => ({ ...c }));
  }

  async setReferralCodeActive(id: string, active: boolean): Promise<void> {
    const c = this.codes.get(id);
    if (c) this.codes.set(id, { ...c, active });
  }

  async createReferral(r: ReferralRecord): Promise<void> {
    this.referrals.set(r.id, { ...r });
    this.byReferred.set(r.referredUserId, r.id);
  }

  async getReferralByReferred(referredUserId: string): Promise<ReferralRecord | undefined> {
    const id = this.byReferred.get(referredUserId);
    const r = id ? this.referrals.get(id) : undefined;
    return r ? { ...r } : undefined;
  }

  async listReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]> {
    return [...this.referrals.values()]
      .filter((r) => r.referrerUserId === referrerUserId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ ...r }));
  }

  async transitionReferral(id: string, from: ReferralStatus[], to: ReferralStatus): Promise<boolean> {
    const r = this.referrals.get(id);
    if (!r || !from.includes(r.status)) return false;
    this.referrals.set(id, { ...r, status: to });
    return true;
  }

  async setReferralStatus(id: string, to: ReferralStatus): Promise<void> {
    const r = this.referrals.get(id);
    if (r) this.referrals.set(id, { ...r, status: to });
  }

  async countRewarded(referrerUserId: string): Promise<number> {
    return [...this.referrals.values()].filter(
      (r) => r.referrerUserId === referrerUserId && r.status === "REWARDED"
    ).length;
  }

  async createAffiliate(r: AffiliateRecord): Promise<void> {
    this.affiliates.set(r.id, { ...r });
    this.affByUser.set(r.userId, r.id);
    this.affByCode.set(r.code, r.id);
  }

  async getAffiliateByUser(userId: string): Promise<AffiliateRecord | undefined> {
    const id = this.affByUser.get(userId);
    const r = id ? this.affiliates.get(id) : undefined;
    return r ? { ...r } : undefined;
  }

  async getAffiliateByCode(code: string): Promise<AffiliateRecord | undefined> {
    const id = this.affByCode.get(code);
    const r = id ? this.affiliates.get(id) : undefined;
    return r ? { ...r } : undefined;
  }

  async getAffiliateById(id: string): Promise<AffiliateRecord | undefined> {
    const r = this.affiliates.get(id);
    return r ? { ...r } : undefined;
  }

  async listAffiliates(status?: AffiliateStatus, limit = 50): Promise<AffiliateRecord[]> {
    return [...this.affiliates.values()]
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  async updateAffiliate(id: string, patch: Partial<AffiliateRecord>): Promise<void> {
    const cur = this.affiliates.get(id);
    if (cur) this.affiliates.set(id, { ...cur, ...patch });
  }

  async createCommission(r: CommissionRecord): Promise<void> {
    this.commissions.set(r.id, { ...r });
    if (r.subscriptionId) this.commBySub.set(r.subscriptionId, r.id);
  }

  async getCommissionBySubscription(subscriptionId: string): Promise<CommissionRecord | undefined> {
    const id = this.commBySub.get(subscriptionId);
    const r = id ? this.commissions.get(id) : undefined;
    return r ? { ...r } : undefined;
  }

  async listCommissions(affiliateId: string): Promise<CommissionRecord[]> {
    return [...this.commissions.values()]
      .filter((c) => c.affiliateId === affiliateId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ ...c }));
  }

  async setCommissionStatus(id: string, to: CommissionRecord["status"]): Promise<void> {
    const c = this.commissions.get(id);
    if (c) this.commissions.set(id, { ...c, status: to });
  }

  async createPayout(r: PayoutRecord): Promise<void> {
    const arr = this.payouts.get(r.affiliateId) ?? [];
    arr.push({ ...r });
    this.payouts.set(r.affiliateId, arr);
  }

  async listPayouts(affiliateId: string): Promise<PayoutRecord[]> {
    return [...(this.payouts.get(affiliateId) ?? [])].map((p) => ({ ...p }));
  }

  async setPayoutStatus(id: string, to: PayoutRecord["status"]): Promise<void> {
    for (const [aid, arr] of this.payouts) {
      const i = arr.findIndex((p) => p.id === id);
      if (i >= 0) {
        arr[i] = { ...arr[i]!, status: to };
        this.payouts.set(aid, arr);
        return;
      }
    }
  }

  async createNotification(r: NotificationRecord): Promise<void> {
    const arr = this.notifications.get(r.userId) ?? [];
    arr.unshift({ ...r });
    this.notifications.set(r.userId, arr.slice(0, 100));
  }

  async listNotifications(userId: string, limit: number): Promise<NotificationRecord[]> {
    return (this.notifications.get(userId) ?? []).slice(0, limit).map((n) => ({ ...n }));
  }

  async countUnread(userId: string): Promise<number> {
    return (this.notifications.get(userId) ?? []).filter((n) => !n.readAt).length;
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const arr = this.notifications.get(userId) ?? [];
    const i = arr.findIndex((n) => n.id === id);
    if (i < 0) return false;
    arr[i] = { ...arr[i]!, readAt: Date.now() };
    this.notifications.set(userId, arr);
    return true;
  }

  async markAllRead(userId: string): Promise<number> {
    const arr = this.notifications.get(userId) ?? [];
    let n = 0;
    for (const item of arr) {
      if (!item.readAt) {
        item.readAt = Date.now();
        n += 1;
      }
    }
    return n;
  }

  async deleteNotificationsForUser(userId: string): Promise<void> {
    this.notifications.delete(userId);
    this.prefs.delete(userId);
  }

  async purgeNotifications(beforeMs: number, limit: number): Promise<number> {
    let n = 0;
    for (const [userId, arr] of this.notifications) {
      const kept = arr.filter((item) => {
        if (n < limit && item.createdAt < beforeMs) {
          n += 1;
          return false;
        }
        return true;
      });
      if (kept.length === 0) this.notifications.delete(userId);
      else this.notifications.set(userId, kept);
    }
    return n;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return { ...DEFAULT_PREFS, ...this.prefs.get(userId) };
  }

  async setPreferences(userId: string, p: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const next = { ...DEFAULT_PREFS, ...this.prefs.get(userId), ...p };
    this.prefs.set(userId, next);
    return { ...next };
  }

  async deletePreferences(userId: string): Promise<void> {
    this.prefs.delete(userId);
  }

  async logEmail(r: EmailLogRecord): Promise<void> {
    this.emails.set(r.id, { ...r });
  }

  async setEmailStatus(id: string, status: EmailLogRecord["status"], error?: string): Promise<void> {
    const e = this.emails.get(id);
    if (e) this.emails.set(id, { ...e, status, error });
  }

  async purgeEmailLogs(beforeMs: number, limit: number): Promise<number> {
    let n = 0;
    for (const [id, e] of this.emails) {
      if (n < limit && e.createdAt < beforeMs) {
        this.emails.delete(id);
        n += 1;
      }
    }
    return n;
  }

  async createCampaign(r: CampaignRecord): Promise<void> {
    this.campaigns.set(r.id, { ...r });
  }

  async getCampaign(id: string): Promise<CampaignRecord | undefined> {
    const c = this.campaigns.get(id);
    return c ? { ...c } : undefined;
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    return [...this.campaigns.values()].sort((a, b) => b.createdAt - a.createdAt).map((c) => ({ ...c }));
  }

  async updateCampaign(id: string, patch: Partial<CampaignRecord>): Promise<void> {
    const cur = this.campaigns.get(id);
    if (cur) this.campaigns.set(id, { ...cur, ...patch });
  }
}

let shared: MemoryGrowthStore | null = null;

export function getMemoryGrowthStore(): MemoryGrowthStore {
  if (!shared) shared = new MemoryGrowthStore();
  return shared;
}
