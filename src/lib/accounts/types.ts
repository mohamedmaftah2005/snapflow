export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type UserRole = "USER" | "SUPPORT" | "OPERATOR" | "ADMIN";
export type PlanId = "free" | "premium";
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "EXPIRED";
export type BillingProvider = "stripe" | "test";

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  status: UserStatus;
  role: UserRole;
  emailVerifiedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string; // sha256 hex of the opaque token
  userId: string;
  expiresAt: number;
  lastSeenAt: number;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: PlanId;
  provider: BillingProvider;
  externalCustomerId?: string;
  externalSubscriptionId?: string;
  status: SubscriptionStatus;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UsageRecord {
  downloads: number;
  bytes: number;
}

export interface AccountStore {
  // users
  createUser(u: { id: string; email: string; passwordHash: string; name?: string }): Promise<UserRecord>;
  getUserById(id: string): Promise<(UserRecord & { passwordHash: string }) | undefined>;
  getUserByEmail(emailLower: string): Promise<(UserRecord & { passwordHash: string }) | undefined>;
  updateUser(id: string, patch: Partial<Pick<UserRecord, "name" | "status" | "role">> & { emailVerifiedAt?: number }): Promise<void>;
  setPasswordHash(id: string, hash: string): Promise<void>;
  anonymizeUser(id: string): Promise<void>;
  // sessions
  createSession(s: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  touchSession(id: string, now: number): Promise<void>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  // one-time tokens (hashes only)
  createAuthToken(t: { id: string; userId: string; purpose: "verify" | "reset"; expiresAt: number }): Promise<void>;
  consumeAuthToken(id: string, purpose: "verify" | "reset", now: number): Promise<string | undefined>;
  // subscriptions
  upsertSubscription(s: SubscriptionRecord): Promise<void>;
  getActiveSubscription(userId: string): Promise<SubscriptionRecord | undefined>;
  getSubscriptionByExternal(externalId: string): Promise<SubscriptionRecord | undefined>;
  listSubscriptions(userId: string): Promise<SubscriptionRecord[]>;
  // webhook ledger
  recordWebhookEvent(e: { id: string; provider: string; type: string }): Promise<boolean>;
  markWebhookEvent(id: string, status: "PROCESSED" | "FAILED", error?: string): Promise<void>;
  listWebhookEvents(opts: { limit: number; offset: number }): Promise<{
    events: { id: string; provider: string; type: string; status: string; error?: string; receivedAt: number }[];
    total: number;
  }>;
  // usage — reserve() must be atomic (single statement / single-threaded op)
  reserveDownload(bucket: { userId?: string; guestKey?: string; day: string }, limit: number | null): Promise<boolean>;
  refundDownload(bucket: { userId?: string; guestKey?: string; day: string }): Promise<void>;
  getUsage(bucket: { userId?: string; guestKey?: string; day: string }): Promise<UsageRecord>;
  // history
  close?(): Promise<void>;
  // admin: users
  listUsers(opts: {
    query?: string;
    plan?: string;
    status?: string;
    role?: string;
    limit: number;
    offset: number;
  }): Promise<{ users: UserRecord[]; total: number }>;
  countUsers(sinceMs?: number): Promise<number>;
  // admin: audit (append-only; no update/delete exists by design)
  appendAudit(e: {
    id: string; actorUserId: string | null; actorRole: string; action: string;
    targetType?: string; targetId?: string; reason?: string;
    metadata?: Record<string, unknown>; requestId?: string; createdAt: number;
  }): Promise<void>;
  listAudit(opts: {
    action?: string; actor?: string; target?: string; sinceMs?: number;
    limit: number; offset: number;
  }): Promise<{ entries: AuditEntryLike[]; total: number }>;
  // admin: flags
  getFlag(key: string): Promise<boolean | undefined>;
  setFlag(key: string, enabled: boolean, updatedBy: string | null): Promise<void>;
  listFlags(): Promise<{ key: string; enabled: boolean; updatedAt: number }[]>;
  // saved downloads (metadata bookmarks; media still expires normally)
  saveJob(userId: string, jobId: string): Promise<void>;
  unsaveJob(userId: string, jobId: string): Promise<void>;
  listSavedIds(userId: string): Promise<string[]>;
  /** Single-bookmark lookup for detail views (avoids full-list scans). */
  isSaved(userId: string, jobId: string): Promise<boolean>;
}

export interface AuditEntryLike {
  id: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt: number;
}
