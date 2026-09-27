import type { AccountStore, AuditEntryLike, SessionRecord, SubscriptionRecord, UsageRecord, UserRecord } from "./types";
import { getMemoryGrowthStore } from "@/lib/growth/memory";

type UserRow = UserRecord & { passwordHash: string };

/** In-process store for local dev/tests. Same interface as Postgres. */
export class MemoryAccountStore implements AccountStore {
  private users = new Map<string, UserRow>();
  private byEmail = new Map<string, string>();
  private sessions = new Map<string, SessionRecord>();
  private tokens = new Map<string, { userId: string; purpose: string; expiresAt: number; used: boolean }>();
  private subs = new Map<string, SubscriptionRecord>();
  private webhooks = new Map<string, { status: string; error?: string; provider: string; type: string; receivedAt: number }>();
  private usage = new Map<string, UsageRecord>();

  private usageKey(b: { userId?: string; guestKey?: string; day: string }): string {
    return `${b.day}:${b.userId ? `u:${b.userId}` : `g:${b.guestKey}`}`;
  }

  async createUser(u: { id: string; email: string; passwordHash: string; name?: string }): Promise<UserRecord> {
    const now = Date.now();
    const rec: UserRow = {
      id: u.id, email: u.email, passwordHash: u.passwordHash, name: u.name,
      status: "ACTIVE", role: "USER", createdAt: now, updatedAt: now,
    };
    this.users.set(u.id, rec);
    this.byEmail.set(u.email.toLowerCase(), u.id);
    return { id: rec.id, email: rec.email, name: rec.name, status: rec.status, role: rec.role, createdAt: rec.createdAt, updatedAt: rec.updatedAt };
  }

  async getUserById(id: string): Promise<UserRow | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(emailLower: string): Promise<UserRow | undefined> {
    const id = this.byEmail.get(emailLower);
    return id ? this.users.get(id) : undefined;
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    const cur = this.users.get(id);
    if (cur) this.users.set(id, { ...cur, ...patch, updatedAt: Date.now() });
  }

  async setPasswordHash(id: string, hash: string): Promise<void> {
    const cur = this.users.get(id);
    if (cur) this.users.set(id, { ...cur, passwordHash: hash, updatedAt: Date.now() });
  }

  async anonymizeUser(id: string): Promise<void> {
    const cur = this.users.get(id);
    if (!cur) return;
    this.byEmail.delete(cur.email.toLowerCase());
    this.users.set(id, {
      ...cur,
      email: `deleted-${id}@example.invalid`,
      name: undefined,
      status: "DELETED",
      updatedAt: Date.now(),
    });
    for (const sid of [...this.sessions.keys()]) {
      if (this.sessions.get(sid)?.userId === id) this.sessions.delete(sid);
    }
    // Growth cleanup: notifications + prefs go with the account; referral
    // codes deactivate via owner status; financial ledger rows are retained.
    await getMemoryGrowthStore().deleteNotificationsForUser(id).catch(() => undefined);
    for (const code of await getMemoryGrowthStore().listReferralCodes(id)) {
      await getMemoryGrowthStore().setReferralCodeActive(code.id, false).catch(() => undefined);
    }
  }

  async createSession(s: SessionRecord): Promise<void> {
    this.sessions.set(s.id, { ...s });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(id);
  }

  async touchSession(id: string, now: number): Promise<void> {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, lastSeenAt: now });
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [sid, s] of this.sessions) {
      if (s.userId === userId) this.sessions.delete(sid);
    }
  }

  async createAuthToken(t: { id: string; userId: string; purpose: string; expiresAt: number }): Promise<void> {
    this.tokens.set(t.id, { ...t, used: false });
  }

  async consumeAuthToken(id: string, purpose: string, now: number): Promise<string | undefined> {
    const t = this.tokens.get(id);
    if (!t || t.purpose !== purpose || t.used || t.expiresAt < now) return undefined;
    t.used = true;
    return t.userId;
  }

  async upsertSubscription(s: SubscriptionRecord): Promise<void> {
    this.subs.set(s.id, { ...s });
  }

  async getActiveSubscription(userId: string): Promise<SubscriptionRecord | undefined> {
    const now = Date.now();
    const act = [...this.subs.values()]
      .filter((s) => s.userId === userId && (s.status === "ACTIVE" || s.status === "TRIALING" || s.status === "PAST_DUE"))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!act) return undefined;
    // Lazy downgrade: past period end with no renewal → treated as expired.
    if (act.currentPeriodEnd && act.currentPeriodEnd < now && !act.cancelAtPeriodEnd && act.status === "ACTIVE") {
      return undefined;
    }
    return act;
  }

  async getSubscriptionByExternal(externalId: string): Promise<SubscriptionRecord | undefined> {
    return [...this.subs.values()].find((s) => s.externalSubscriptionId === externalId);
  }

  async listSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
    return [...this.subs.values()].filter((s) => s.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  }

  async recordWebhookEvent(e: { id: string; provider: string; type: string }): Promise<boolean> {
    if (this.webhooks.has(e.id)) return false;
    this.webhooks.set(e.id, { status: "RECEIVED", provider: e.provider, type: e.type, receivedAt: Date.now() });
    return true;
  }

  async listWebhookEvents(opts: { limit: number; offset: number }): Promise<{
    events: { id: string; provider: string; type: string; status: string; error?: string; receivedAt: number }[];
    total: number;
  }> {
    const all = [...this.webhooks.entries()]
      .map(([id, e]) => ({ id, ...e }))
      .sort((a, b) => b.receivedAt - a.receivedAt);
    return { events: all.slice(opts.offset, opts.offset + opts.limit), total: all.length };
  }

  async markWebhookEvent(id: string, status: "PROCESSED" | "FAILED", error?: string): Promise<void> {
    const e = this.webhooks.get(id);
    if (e) this.webhooks.set(id, { ...e, status, error });
  }

  async reserveDownload(b: { userId?: string; guestKey?: string; day: string }, limit: number | null): Promise<boolean> {
    // Single-threaded: read-modify-write is atomic here. Postgres impl uses one statement.
    const k = this.usageKey(b);
    const cur = this.usage.get(k) ?? { downloads: 0, bytes: 0 };
    if (limit !== null && cur.downloads >= limit) return false;
    this.usage.set(k, { ...cur, downloads: cur.downloads + 1 });
    return true;
  }

  async refundDownload(b: { userId?: string; guestKey?: string; day: string }): Promise<void> {
    const k = this.usageKey(b);
    const cur = this.usage.get(k);
    if (cur && cur.downloads > 0) this.usage.set(k, { ...cur, downloads: cur.downloads - 1 });
  }

  async getUsage(b: { userId?: string; guestKey?: string; day: string }): Promise<UsageRecord> {
    return this.usage.get(this.usageKey(b)) ?? { downloads: 0, bytes: 0 };
  }

  // ---- admin ----

  async listUsers(opts: {
    query?: string; plan?: string; status?: string; role?: string; limit: number; offset: number;
  }): Promise<{ users: UserRecord[]; total: number }> {
    const q = (opts.query ?? "").toLowerCase();
    const all = [...this.users.values()].filter((u) => {
      if (opts.status && u.status !== opts.status) return false;
      if (opts.role && u.role !== opts.role) return false;
      if (q && !u.email.toLowerCase().includes(q) && u.id !== opts.query) return false;
      return true;
    });
    // plan filter needs subscriptions; applied by the caller when available.
    const total = all.length;
    const page = all
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(opts.offset, opts.offset + opts.limit)
      .map((u) => ({
        id: u.id, email: u.email, name: u.name, status: u.status, role: u.role,
        emailVerifiedAt: u.emailVerifiedAt, createdAt: u.createdAt, updatedAt: u.updatedAt,
      }));
    return { users: page, total };
  }

  async countUsers(sinceMs?: number): Promise<number> {
    if (!sinceMs) return this.users.size;
    return [...this.users.values()].filter((u) => u.createdAt >= sinceMs).length;
  }

  private audit: { id: string; actorUserId: string | null; actorRole: string; action: string; targetType?: string; targetId?: string; reason?: string; metadata?: Record<string, unknown>; requestId?: string; createdAt: number }[] = [];
  private flags = new Map<string, { enabled: boolean; updatedAt: number }>();

  async appendAudit(e: {
    id: string; actorUserId: string | null; actorRole: string; action: string;
    targetType?: string; targetId?: string; reason?: string;
    metadata?: Record<string, unknown>; requestId?: string; createdAt: number;
  }): Promise<void> {
    this.audit.push({ ...e });
  }

  async listAudit(opts: {
    action?: string; actor?: string; target?: string; sinceMs?: number; limit: number; offset: number;
  }): Promise<{ entries: AuditEntryLike[]; total: number }> {
    const all = this.audit.filter((e) => {
      if (opts.action && e.action !== opts.action) return false;
      if (opts.actor && e.actorUserId !== opts.actor) return false;
      if (opts.target && e.targetId !== opts.target && e.targetType !== opts.target) return false;
      if (opts.sinceMs && e.createdAt < opts.sinceMs) return false;
      return true;
    });
    const total = all.length;
    const entries = all
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(opts.offset, opts.offset + opts.limit);
    return { entries, total };
  }

  async getFlag(key: string): Promise<boolean | undefined> {
    return this.flags.get(key)?.enabled;
  }

  async setFlag(key: string, enabled: boolean, updatedBy: string | null): Promise<void> {
    void updatedBy; // memory driver has no actor column; the audit log records the actor
    this.flags.set(key, { enabled, updatedAt: Date.now() });
  }

  async listFlags(): Promise<{ key: string; enabled: boolean; updatedAt: number }[]> {
    return [...this.flags.entries()].map(([key, v]) => ({ key, ...v }));
  }

  private saved = new Map<string, Set<string>>();

  async saveJob(userId: string, jobId: string): Promise<void> {
    const s = this.saved.get(userId) ?? new Set<string>();
    s.add(jobId);
    this.saved.set(userId, s);
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    this.saved.get(userId)?.delete(jobId);
  }

  async listSavedIds(userId: string): Promise<string[]> {
    return [...(this.saved.get(userId) ?? [])];
  }

  async isSaved(userId: string, jobId: string): Promise<boolean> {
    return this.saved.get(userId)?.has(jobId) ?? false;
  }
}

let shared: MemoryAccountStore | null = null;

export function getMemoryAccountStore(): MemoryAccountStore {
  if (!shared) shared = new MemoryAccountStore();
  return shared;
}
