import { Pool } from "pg";
import { createPool } from "@/lib/db/pool";
import type { ApiKeyRecord, ApiScope, ApiStore, IdempotencyRecord, WebhookDeliveryRecord, WebhookEndpointRecord, WebhookEventName } from "./types";

function toKey(row: Record<string, unknown>): ApiKeyRecord {
  const t = (v: unknown): number | undefined => (v ? new Date(v as string).getTime() : undefined);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    prefix: String(row.prefix),
    keyHash: String(row.key_hash),
    scopes: (row.scopes as ApiScope[]) ?? [],
    lastUsedAt: t(row.last_used_at),
    expiresAt: t(row.expires_at),
    revokedAt: t(row.revoked_at),
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

export class PostgresApiStore implements ApiStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = createPool(connectionString, { name: "api", max: 3 });
  }

  async createApiKey(r: ApiKeyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),to_timestamp($8/1000.0))`,
      [r.id, r.userId, r.name, r.prefix, r.keyHash, r.scopes, r.expiresAt ?? null, r.createdAt]
    );
  }

  async getApiKeyByHash(hash: string): Promise<ApiKeyRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM api_keys WHERE key_hash = $1", [hash]);
    return r.rowCount ? toKey(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    const r = await this.pool.query("SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return (r.rows as Record<string, unknown>[]).map(toKey);
  }

  async touchApiKey(id: string, now: number): Promise<void> {
    await this.pool.query("UPDATE api_keys SET last_used_at = to_timestamp($2/1000.0) WHERE id = $1", [id, now]);
  }

  async revokeApiKey(userId: string, id: string): Promise<boolean> {
    const r = await this.pool.query(
      "UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [id, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async countActiveKeys(userId: string): Promise<number> {
    const r = await this.pool.query(
      "SELECT COUNT(*)::int AS n FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())",
      [userId]
    );
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async getIdempotency(userId: string, key: string, now: number): Promise<IdempotencyRecord | undefined> {
    const r = await this.pool.query(
      "SELECT * FROM api_idempotency_keys WHERE user_id = $1 AND key = $2",
      [userId, key]
    );
    if (!r.rowCount) return undefined;
    const row = r.rows[0] as Record<string, unknown>;
    const exp = new Date(row.expires_at as string).getTime();
    if (exp < now) {
      await this.pool.query("DELETE FROM api_idempotency_keys WHERE user_id = $1 AND key = $2", [userId, key]);
      return undefined;
    }
    return {
      key: String(row.key),
      userId: String(row.user_id),
      apiKeyId: String(row.api_key_id),
      requestHash: String(row.request_hash),
      response: row.response,
      statusCode: Number(row.status_code),
      expiresAt: exp,
    };
  }

  async saveIdempotency(r: IdempotencyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_idempotency_keys (key, user_id, api_key_id, request_hash, response, status_code, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))
       ON CONFLICT (user_id, key) DO NOTHING`,
      [r.key, r.userId, r.apiKeyId, r.requestHash, JSON.stringify(r.response), r.statusCode, r.expiresAt]
    );
  }

  async purgeExpiredIdempotency(now: number): Promise<number> {
    const r = await this.pool.query("DELETE FROM api_idempotency_keys WHERE expires_at < to_timestamp($1/1000.0)", [now]);
    return r.rowCount ?? 0;
  }

  async createWebhookEndpoint(r: WebhookEndpointRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_endpoints (id, user_id, url, secret_encrypted, events, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))`,
      [r.id, r.userId, r.url, r.secretEncrypted, r.events, r.active, r.createdAt]
    );
  }

  async getWebhookEndpoint(id: string): Promise<WebhookEndpointRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM webhook_endpoints WHERE id = $1", [id]);
    if (!r.rowCount) return undefined;
    return toEndpoint(r.rows[0] as Record<string, unknown>);
  }

  async listWebhookEndpoints(userId: string): Promise<WebhookEndpointRecord[]> {
    const r = await this.pool.query("SELECT * FROM webhook_endpoints WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return (r.rows as Record<string, unknown>[]).map(toEndpoint);
  }

  async updateWebhookEndpoint(id: string, patch: Partial<WebhookEndpointRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [id];
    let i = 2;
    if (patch.active !== undefined) { sets.push(`active = $${i++}`); vals.push(patch.active); }
    if (patch.events !== undefined) { sets.push(`events = $${i++}`); vals.push(patch.events); }
    if (patch.secretEncrypted !== undefined) { sets.push(`secret_encrypted = $${i++}`); vals.push(patch.secretEncrypted); }
    if (patch.consecutiveFailures !== undefined) { sets.push(`consecutive_failures = $${i++}`); vals.push(patch.consecutiveFailures); }
    if (patch.lastDeliveredAt !== undefined) {
      sets.push(`last_delivered_at = to_timestamp($${i++}/1000.0)`); vals.push(patch.lastDeliveredAt);
    }
    if (sets.length === 0) return;
    await this.pool.query(`UPDATE webhook_endpoints SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  async deleteWebhookEndpoint(userId: string, id: string): Promise<boolean> {
    const r = await this.pool.query("DELETE FROM webhook_endpoints WHERE id = $1 AND user_id = $2", [id, userId]);
    return (r.rowCount ?? 0) > 0;
  }

  async countWebhookEndpoints(userId: string): Promise<number> {
    const r = await this.pool.query("SELECT COUNT(*)::int AS n FROM webhook_endpoints WHERE user_id = $1", [userId]);
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async recordDelivery(r: WebhookDeliveryRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_deliveries (id, endpoint_id, event_id, event_type, status, http_status, attempts, error, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0))`,
      [r.id, r.endpointId, r.eventId, r.eventType, r.status, r.httpStatus ?? null, r.attempts, r.error ?? null, r.createdAt]
    );
    // Bounded ledger: prune to the newest 100 rows, but only on ~10% of
    // deliveries — the subquery on every write was pure overhead.
    if (Math.random() < 0.1) {
      await this.pool.query(
        "DELETE FROM webhook_deliveries WHERE endpoint_id = $1 AND id NOT IN (SELECT id FROM webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT 100)",
        [r.endpointId]
      );
    }
  }

  async listDeliveries(endpointId: string, limit: number): Promise<WebhookDeliveryRecord[]> {
    const r = await this.pool.query(
      "SELECT * FROM webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT $2",
      [endpointId, limit]
    );
    return (r.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      endpointId: String(row.endpoint_id),
      eventId: String(row.event_id),
      eventType: String(row.event_type),
      status: row.status as WebhookDeliveryRecord["status"],
      httpStatus: (row.http_status as number | null) ?? undefined,
      attempts: Number(row.attempts),
      error: (row.error as string | null) ?? undefined,
      createdAt: new Date(row.created_at as string).getTime(),
    }));
  }

  async purgeDeliveries(beforeMs: number): Promise<number> {
    const r = await this.pool.query(
      "DELETE FROM webhook_deliveries WHERE created_at < to_timestamp($1/1000.0)",
      [beforeMs]
    );
    return r.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function toEndpoint(row: Record<string, unknown>): WebhookEndpointRecord {
  const t = (v: unknown): number | undefined => (v ? new Date(v as string).getTime() : undefined);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    url: String(row.url),
    secretEncrypted: String(row.secret_encrypted),
    events: (row.events as WebhookEventName[]) ?? [],
    active: Boolean(row.active),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    lastDeliveredAt: t(row.last_delivered_at),
    createdAt: new Date(row.created_at as string).getTime(),
  };
}
