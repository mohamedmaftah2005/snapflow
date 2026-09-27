import { Pool } from "pg";
import { createPool } from "@/lib/db/pool";
import type {
  AccountStore, AuditEntryLike, SessionRecord, SubscriptionRecord, UsageRecord, UserRecord,
} from "./types";

type UserRow = UserRecord & { passwordHash: string };

function toUser(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    name: (row.name as string | null) ?? undefined,
    status: row.status as UserRow["status"],
    role: (row.role as UserRow["role"]) ?? "USER",
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at as string).getTime() : undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

function toSub(row: Record<string, unknown>): SubscriptionRecord {
  const t = (v: unknown): number | undefined => (v ? new Date(v as string).getTime() : undefined);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    planId: row.plan_id as SubscriptionRecord["planId"],
    provider: row.provider as SubscriptionRecord["provider"],
    externalCustomerId: (row.external_customer_id as string | null) ?? undefined,
    externalSubscriptionId: (row.external_subscription_id as string | null) ?? undefined,
    status: row.status as SubscriptionRecord["status"],
    currentPeriodStart: t(row.current_period_start),
    currentPeriodEnd: t(row.current_period_end),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

export class PostgresAccountStore implements AccountStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = createPool(connectionString, { name: "accounts", max: 5 });
  }

  async createUser(u: { id: string; email: string; passwordHash: string; name?: string }): Promise<UserRecord> {
    const r = await this.pool.query(
      `INSERT INTO users (id, email, email_lower, password_hash, name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [u.id, u.email, u.email.toLowerCase(), u.passwordHash, u.name ?? null]
    );
    const row = toUser(r.rows[0] as Record<string, unknown>);
    return { id: row.id, email: row.email, name: row.name, status: row.status, role: row.role, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async getUserById(id: string): Promise<UserRow | undefined> {
    const r = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return r.rowCount ? toUser(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async getUserByEmail(emailLower: string): Promise<UserRow | undefined> {
    const r = await this.pool.query("SELECT * FROM users WHERE email_lower = $1", [emailLower]);
    return r.rowCount ? toUser(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id];
    let i = 2;
    if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name); }
    if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status); }
    if (patch.role !== undefined) { sets.push(`role = $${i++}`); vals.push(patch.role); }
    if (patch.emailVerifiedAt !== undefined) {
      sets.push(`email_verified_at = to_timestamp($${i++}/1000.0)`);
      vals.push(patch.emailVerifiedAt);
    }
    await this.pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  async setPasswordHash(id: string, hash: string): Promise<void> {
    await this.pool.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [id, hash]);
  }

  async anonymizeUser(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET email = $2, email_lower = $3, name = NULL, password_hash = 'deleted',
        status = 'DELETED', updated_at = now() WHERE id = $1`,
      [id, `deleted-${id}@example.invalid`, `deleted-${id}@example.invalid`]
    );
    await this.pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    // Growth cleanup: notifications + prefs deleted; codes deactivated
    // (attribution checks owner status anyway); ledger rows retained.
    await this.pool.query("DELETE FROM notifications WHERE user_id = $1", [id]).catch(() => undefined);
    await this.pool.query("DELETE FROM notification_preferences WHERE user_id = $1", [id]).catch(() => undefined);
    await this.pool.query("UPDATE referral_codes SET active = FALSE WHERE user_id = $1", [id]).catch(() => undefined);
  }

  async createSession(s: SessionRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,to_timestamp($3/1000.0))",
      [s.id, s.userId, s.expiresAt]
    );
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
    if (!r.rowCount) return undefined;
    const row = r.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      expiresAt: new Date(row.expires_at as string).getTime(),
      lastSeenAt: new Date(row.last_seen_at as string).getTime(),
    };
  }

  async touchSession(id: string, now: number): Promise<void> {
    await this.pool.query("UPDATE sessions SET last_seen_at = to_timestamp($2/1000.0) WHERE id = $1", [id, now]);
  }

  async deleteSession(id: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  }

  async createAuthToken(t: { id: string; userId: string; purpose: string; expiresAt: number }): Promise<void> {
    await this.pool.query(
      "INSERT INTO auth_tokens (id, user_id, purpose, expires_at) VALUES ($1,$2,$3,to_timestamp($4/1000.0))",
      [t.id, t.userId, t.purpose, t.expiresAt]
    );
  }

  async consumeAuthToken(id: string, purpose: string, now: number): Promise<string | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `UPDATE auth_tokens SET used_at = now() WHERE id = $1 AND purpose = $2
         AND used_at IS NULL AND expires_at > to_timestamp($3/1000.0) RETURNING user_id`,
        [id, purpose, now]
      );
      await client.query("COMMIT");
      return r.rowCount ? String((r.rows[0] as { user_id: string }).user_id) : undefined;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async upsertSubscription(s: SubscriptionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, provider, external_customer_id, external_subscription_id,
         status, current_period_start, current_period_end, cancel_at_period_end, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0),$10,now())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end, updated_at = now()`,
      [s.id, s.userId, s.planId, s.provider, s.externalCustomerId ?? null,
       s.externalSubscriptionId ?? null, s.status, s.currentPeriodStart ?? null,
       s.currentPeriodEnd ?? null, s.cancelAtPeriodEnd]
    );
  }

  async getActiveSubscription(userId: string): Promise<SubscriptionRecord | undefined> {
    const r = await this.pool.query(
      `SELECT * FROM subscriptions WHERE user_id = $1
       AND status IN ('ACTIVE','TRIALING','PAST_DUE') ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (!r.rowCount) return undefined;
    const s = toSub(r.rows[0] as Record<string, unknown>);
    if (s.currentPeriodEnd && s.currentPeriodEnd < Date.now() && !s.cancelAtPeriodEnd && s.status === "ACTIVE") {
      return undefined; // lazy downgrade, mirrors memory impl
    }
    return s;
  }

  async getSubscriptionByExternal(externalId: string): Promise<SubscriptionRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM subscriptions WHERE external_subscription_id = $1", [externalId]);
    return r.rowCount ? toSub(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async listSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
    const r = await this.pool.query("SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return (r.rows as Record<string, unknown>[]).map(toSub);
  }

  async recordWebhookEvent(e: { id: string; provider: string; type: string }): Promise<boolean> {
    const r = await this.pool.query(
      "INSERT INTO webhook_events (id, provider, type, status) VALUES ($1,$2,$3,'RECEIVED') ON CONFLICT (id) DO NOTHING",
      [e.id, e.provider, e.type]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async markWebhookEvent(id: string, status: "PROCESSED" | "FAILED", error?: string): Promise<void> {
    await this.pool.query("UPDATE webhook_events SET status = $2, error = $3 WHERE id = $1", [id, status, error ?? null]);
  }

  async listWebhookEvents(opts: { limit: number; offset: number }): Promise<{
    events: { id: string; provider: string; type: string; status: string; error?: string; receivedAt: number }[];
    total: number;
  }> {
    const total = Number(
      (await this.pool.query("SELECT COUNT(*)::int AS n FROM webhook_events")).rows[0].n
    );
    const r = await this.pool.query(
      "SELECT id, provider, type, status, error, received_at FROM webhook_events ORDER BY received_at DESC LIMIT $1 OFFSET $2",
      [opts.limit, opts.offset]
    );
    return {
      events: (r.rows as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        provider: String(row.provider),
        type: String(row.type),
        status: String(row.status),
        error: (row.error as string | null) ?? undefined,
        receivedAt: new Date(row.received_at as string).getTime(),
      })),
      total,
    };
  }

  async reserveDownload(b: { userId?: string; guestKey?: string; day: string }, limit: number | null): Promise<boolean> {
    // Atomic: single statement, row lock via upsert + conditional increment.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO usage_daily (user_id, guest_key, day, downloads)
         VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING`,
        [b.userId ?? null, b.guestKey ?? null, b.day]
      );
      const cond = limit === null ? "" : "AND downloads < $4";
      const params: unknown[] = limit === null ? [b.userId ?? null, b.guestKey ?? null, b.day] : [b.userId ?? null, b.guestKey ?? null, b.day, limit];
      const r = await client.query(
        `UPDATE usage_daily SET downloads = downloads + 1, updated_at = now()
         WHERE day = $3
           AND ((user_id IS NOT DISTINCT FROM $1) AND (guest_key IS NOT DISTINCT FROM $2))
           ${cond} RETURNING downloads`,
        params
      );
      await client.query("COMMIT");
      return (r.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async refundDownload(b: { userId?: string; guestKey?: string; day: string }): Promise<void> {
    await this.pool.query(
      `UPDATE usage_daily SET downloads = GREATEST(downloads - 1, 0), updated_at = now()
       WHERE day = $3 AND (user_id IS NOT DISTINCT FROM $1) AND (guest_key IS NOT DISTINCT FROM $2)`,
      [b.userId ?? null, b.guestKey ?? null, b.day]
    );
  }

  async getUsage(b: { userId?: string; guestKey?: string; day: string }): Promise<UsageRecord> {
    const r = await this.pool.query(
      `SELECT downloads, bytes FROM usage_daily
       WHERE day = $3 AND (user_id IS NOT DISTINCT FROM $1) AND (guest_key IS NOT DISTINCT FROM $2)`,
      [b.userId ?? null, b.guestKey ?? null, b.day]
    );
    if (!r.rowCount) return { downloads: 0, bytes: 0 };
    const row = r.rows[0] as { downloads: number; bytes: string };
    return { downloads: Number(row.downloads), bytes: Number(row.bytes) };
  }

  // ---- admin ----

  async listUsers(opts: {
    query?: string; status?: string; role?: string; limit: number; offset: number;
  }): Promise<{ users: UserRecord[]; total: number }> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (opts.query) {
      conds.push(`(email ILIKE $${i} OR id = $${i + 1})`);
      vals.push(`%${opts.query}%`, opts.query);
      i += 2;
    }
    if (opts.status) { conds.push(`status = $${i++}`); vals.push(opts.status); }
    if (opts.role) { conds.push(`role = $${i++}`); vals.push(opts.role); }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const total = Number(
      (await this.pool.query(`SELECT COUNT(*)::int AS n FROM users ${where}`, vals)).rows[0].n
    );
    const r = await this.pool.query(
      `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, opts.limit, opts.offset]
    );
    const users = (r.rows as Record<string, unknown>[]).map((row) => {
      const u = toUser(row);
      return {
        id: u.id, email: u.email, name: u.name, status: u.status, role: u.role,
        emailVerifiedAt: u.emailVerifiedAt, createdAt: u.createdAt, updatedAt: u.updatedAt,
      };
    });
    return { users, total };
  }

  async countUsers(sinceMs?: number): Promise<number> {
    const r = sinceMs
      ? await this.pool.query("SELECT COUNT(*)::int AS n FROM users WHERE created_at > to_timestamp($1/1000.0)", [sinceMs])
      : await this.pool.query("SELECT COUNT(*)::int AS n FROM users");
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async appendAudit(e: {
    id: string; actorUserId: string | null; actorRole: string; action: string;
    targetType?: string; targetId?: string; reason?: string;
    metadata?: Record<string, unknown>; requestId?: string; createdAt: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_audit_logs
        (id, actor_user_id, actor_role, action, target_type, target_id, reason, metadata, request_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10/1000.0))`,
      [e.id, e.actorUserId, e.actorRole, e.action, e.targetType ?? null, e.targetId ?? null,
       e.reason ?? null, e.metadata ? JSON.stringify(e.metadata) : null, e.requestId ?? null, e.createdAt]
    );
  }

  async listAudit(opts: {
    action?: string; actor?: string; target?: string; sinceMs?: number; limit: number; offset: number;
  }): Promise<{ entries: AuditEntryLike[]; total: number }> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (opts.action) { conds.push(`action = $${i++}`); vals.push(opts.action); }
    if (opts.actor) { conds.push(`actor_user_id = $${i++}`); vals.push(opts.actor); }
    if (opts.target) { conds.push(`(target_id = $${i} OR target_type = $${i})`); vals.push(opts.target); i += 1; }
    if (opts.sinceMs) { conds.push(`created_at > to_timestamp($${i++}/1000.0)`); vals.push(opts.sinceMs); }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const total = Number(
      (await this.pool.query(`SELECT COUNT(*)::int AS n FROM admin_audit_logs ${where}`, vals)).rows[0].n
    );
    const r = await this.pool.query(
      `SELECT * FROM admin_audit_logs ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, opts.limit, opts.offset]
    );
    const entries: AuditEntryLike[] = (r.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      actorUserId: (row.actor_user_id as string | null) ?? null,
      actorRole: String(row.actor_role),
      action: String(row.action),
      targetType: (row.target_type as string | null) ?? undefined,
      targetId: (row.target_id as string | null) ?? undefined,
      reason: (row.reason as string | null) ?? undefined,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
      requestId: (row.request_id as string | null) ?? undefined,
      createdAt: new Date(row.created_at as string).getTime(),
    }));
    return { entries, total };
  }

  async getFlag(key: string): Promise<boolean | undefined> {
    const r = await this.pool.query("SELECT enabled FROM feature_flags WHERE key = $1", [key]);
    return r.rowCount ? Boolean((r.rows[0] as { enabled: boolean }).enabled) : undefined;
  }

  async setFlag(key: string, enabled: boolean, updatedBy: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO feature_flags (key, enabled, updated_by, updated_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, enabled, updatedBy]
    );
  }

  async listFlags(): Promise<{ key: string; enabled: boolean; updatedAt: number }[]> {
    const r = await this.pool.query("SELECT key, enabled, updated_at FROM feature_flags ORDER BY key ASC");
    return (r.rows as { key: string; enabled: boolean; updated_at: string }[]).map((row) => ({
      key: row.key, enabled: row.enabled, updatedAt: new Date(row.updated_at).getTime(),
    }));
  }

  async saveJob(userId: string, jobId: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO saved_downloads (user_id, job_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [userId, jobId]
    );
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    await this.pool.query("DELETE FROM saved_downloads WHERE user_id = $1 AND job_id = $2", [userId, jobId]);
  }

  async listSavedIds(userId: string): Promise<string[]> {
    const r = await this.pool.query("SELECT job_id FROM saved_downloads WHERE user_id = $1", [userId]);
    return (r.rows as { job_id: string }[]).map((row) => row.job_id);
  }

  async isSaved(userId: string, jobId: string): Promise<boolean> {
    const r = await this.pool.query(
      "SELECT 1 FROM saved_downloads WHERE user_id = $1 AND job_id = $2 LIMIT 1",
      [userId, jobId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
