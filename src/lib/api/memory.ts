import type { ApiKeyRecord, ApiStore, IdempotencyRecord, WebhookDeliveryRecord, WebhookEndpointRecord } from "./types";

/** In-process store for local dev/tests. Same interface as Postgres. */
export class MemoryApiStore implements ApiStore {
  private keys = new Map<string, ApiKeyRecord>();
  private byHash = new Map<string, string>();
  private idem = new Map<string, IdempotencyRecord>();
  private endpoints = new Map<string, WebhookEndpointRecord>();
  private deliveries = new Map<string, WebhookDeliveryRecord[]>();

  async createApiKey(r: ApiKeyRecord): Promise<void> {
    this.keys.set(r.id, { ...r, scopes: [...r.scopes] });
    this.byHash.set(r.keyHash, r.id);
  }

  async getApiKeyByHash(hash: string): Promise<ApiKeyRecord | undefined> {
    const id = this.byHash.get(hash);
    const r = id ? this.keys.get(id) : undefined;
    return r ? { ...r, scopes: [...r.scopes] } : undefined;
  }

  async listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    return [...this.keys.values()]
      .filter((k) => k.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((k) => ({ ...k, scopes: [...k.scopes] }));
  }

  async touchApiKey(id: string, now: number): Promise<void> {
    const k = this.keys.get(id);
    // Throttled by the caller (only when last use is >1h old).
    if (k) this.keys.set(id, { ...k, lastUsedAt: now });
  }

  async revokeApiKey(userId: string, id: string): Promise<boolean> {
    const k = this.keys.get(id);
    if (!k || k.userId !== userId || k.revokedAt) return false;
    this.keys.set(id, { ...k, revokedAt: Date.now() });
    return true;
  }

  async countActiveKeys(userId: string): Promise<number> {
    const now = Date.now();
    return [...this.keys.values()].filter(
      (k) => k.userId === userId && !k.revokedAt && (!k.expiresAt || k.expiresAt > now)
    ).length;
  }

  private idemKey(userId: string, key: string): string {
    return `${userId}:${key}`;
  }

  async getIdempotency(userId: string, key: string, now: number): Promise<IdempotencyRecord | undefined> {
    const r = this.idem.get(this.idemKey(userId, key));
    if (!r || r.expiresAt < now) {
      if (r) this.idem.delete(this.idemKey(userId, key));
      return undefined;
    }
    return { ...r };
  }

  async saveIdempotency(r: IdempotencyRecord): Promise<void> {
    this.idem.set(this.idemKey(r.userId, r.key), { ...r });
  }

  async purgeExpiredIdempotency(now: number): Promise<number> {
    let n = 0;
    for (const [k, r] of this.idem) {
      if (r.expiresAt < now) {
        this.idem.delete(k);
        n += 1;
      }
    }
    return n;
  }

  async createWebhookEndpoint(r: WebhookEndpointRecord): Promise<void> {
    this.endpoints.set(r.id, { ...r, events: [...r.events] });
  }

  async getWebhookEndpoint(id: string): Promise<WebhookEndpointRecord | undefined> {
    const r = this.endpoints.get(id);
    return r ? { ...r, events: [...r.events] } : undefined;
  }

  async listWebhookEndpoints(userId: string): Promise<WebhookEndpointRecord[]> {
    return [...this.endpoints.values()]
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => ({ ...e, events: [...e.events] }));
  }

  async updateWebhookEndpoint(id: string, patch: Partial<WebhookEndpointRecord>): Promise<void> {
    const cur = this.endpoints.get(id);
    if (cur) this.endpoints.set(id, { ...cur, ...patch });
  }

  async deleteWebhookEndpoint(userId: string, id: string): Promise<boolean> {
    const cur = this.endpoints.get(id);
    if (!cur || cur.userId !== userId) return false;
    this.endpoints.delete(id);
    this.deliveries.delete(id);
    return true;
  }

  async countWebhookEndpoints(userId: string): Promise<number> {
    return [...this.endpoints.values()].filter((e) => e.userId === userId).length;
  }

  async recordDelivery(r: WebhookDeliveryRecord): Promise<void> {
    const arr = this.deliveries.get(r.endpointId) ?? [];
    arr.unshift({ ...r });
    this.deliveries.set(r.endpointId, arr.slice(0, 100));
  }

  async listDeliveries(endpointId: string, limit: number): Promise<WebhookDeliveryRecord[]> {
    return (this.deliveries.get(endpointId) ?? []).slice(0, limit).map((r) => ({ ...r }));
  }

  async purgeDeliveries(beforeMs: number): Promise<number> {
    let n = 0;
    for (const [ep, arr] of this.deliveries) {
      const kept = arr.filter((r) => r.createdAt >= beforeMs);
      n += arr.length - kept.length;
      this.deliveries.set(ep, kept);
    }
    return n;
  }
}

let shared: MemoryApiStore | null = null;

export function getMemoryApiStore(): MemoryApiStore {
  if (!shared) shared = new MemoryApiStore();
  return shared;
}
