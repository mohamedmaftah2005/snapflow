export type ReferralStatus = "PENDING" | "QUALIFIED" | "REWARDED" | "INVALID" | "REVERSED" | "REVIEW";
export type AffiliateStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";
export type CommissionStatus = "PENDING" | "APPROVED" | "PAID" | "REVERSED";
export type PayoutStatus = "PAYOUT_PENDING" | "PAYOUT_PROCESSING" | "PAYOUT_COMPLETED" | "PAYOUT_FAILED";
export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "DONE";
export type EmailStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

export interface ReferralCodeRecord {
  id: string;
  userId: string;
  code: string;
  active: boolean;
  createdAt: number;
}

export interface ReferralRecord {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCodeId: string;
  status: ReferralStatus;
  createdAt: number;
}

export interface AffiliateRecord {
  id: string;
  userId: string;
  code: string;
  status: AffiliateStatus;
  commissionRate: number;
  createdAt: number;
}

export interface CommissionRecord {
  id: string;
  affiliateId: string;
  userId: string;
  subscriptionId?: string;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  createdAt: number;
}

export interface PayoutRecord {
  id: string;
  affiliateId: string;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  createdAt: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: number;
  createdAt: number;
}

export interface NotificationPreferences {
  marketingEmailOptIn: boolean;
  downloadNotify: boolean;
  referralNotify: boolean;
  affiliateNotify: boolean;
}

export interface EmailLogRecord {
  id: string;
  userId?: string;
  type: string;
  status: EmailStatus;
  error?: string;
  createdAt: number;
}

export interface CampaignRecord {
  id: string;
  name: string;
  type: "win_back" | "inactive_nudge" | "announcement";
  status: CampaignStatus;
  audience: string;
  subject: string;
  body: string;
  startsAt?: number;
  endsAt?: number;
  sentCount: number;
  createdBy?: string;
  createdAt: number;
}

export interface GrowthStore {
  // referral codes
  createReferralCode(r: ReferralCodeRecord): Promise<void>;
  getReferralCode(code: string): Promise<ReferralCodeRecord | undefined>;
  listReferralCodes(userId: string): Promise<ReferralCodeRecord[]>;
  setReferralCodeActive(id: string, active: boolean): Promise<void>;
  // referrals
  createReferral(r: ReferralRecord): Promise<void>;
  getReferralByReferred(referredUserId: string): Promise<ReferralRecord | undefined>;
  listReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]>;
  transitionReferral(id: string, from: ReferralStatus[], to: ReferralStatus): Promise<boolean>;
  setReferralStatus(id: string, to: ReferralStatus): Promise<void>;
  countRewarded(referrerUserId: string): Promise<number>;
  // affiliates
  createAffiliate(r: AffiliateRecord): Promise<void>;
  getAffiliateByUser(userId: string): Promise<AffiliateRecord | undefined>;
  getAffiliateByCode(code: string): Promise<AffiliateRecord | undefined>;
  getAffiliateById(id: string): Promise<AffiliateRecord | undefined>;
  listAffiliates(status?: AffiliateStatus, limit?: number): Promise<AffiliateRecord[]>;
  updateAffiliate(id: string, patch: Partial<AffiliateRecord>): Promise<void>;
  // commissions (append-only; reversals are new states, never deletes)
  createCommission(r: CommissionRecord): Promise<void>;
  getCommissionBySubscription(subscriptionId: string): Promise<CommissionRecord | undefined>;
  listCommissions(affiliateId: string): Promise<CommissionRecord[]>;
  setCommissionStatus(id: string, to: CommissionStatus): Promise<void>;
  // payouts
  createPayout(r: PayoutRecord): Promise<void>;
  listPayouts(affiliateId: string): Promise<PayoutRecord[]>;
  setPayoutStatus(id: string, to: PayoutStatus): Promise<void>;
  // notifications
  createNotification(r: NotificationRecord): Promise<void>;
  listNotifications(userId: string, limit: number): Promise<NotificationRecord[]>;
  countUnread(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
  deleteNotificationsForUser(userId: string): Promise<void>;
  /** Delete notifications created before `beforeMs` (retention sweep). Returns count. */
  purgeNotifications(beforeMs: number, limit: number): Promise<number>;
  // preferences
  getPreferences(userId: string): Promise<NotificationPreferences>;
  setPreferences(userId: string, p: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
  deletePreferences(userId: string): Promise<void>;
  // email log
  logEmail(r: EmailLogRecord): Promise<void>;
  setEmailStatus(id: string, status: EmailStatus, error?: string): Promise<void>;
  /** Delete email log rows created before `beforeMs` (retention sweep). Returns count. */
  purgeEmailLogs(beforeMs: number, limit: number): Promise<number>;
  // campaigns
  createCampaign(r: CampaignRecord): Promise<void>;
  getCampaign(id: string): Promise<CampaignRecord | undefined>;
  listCampaigns(): Promise<CampaignRecord[]>;
  updateCampaign(id: string, patch: Partial<CampaignRecord>): Promise<void>;
}
