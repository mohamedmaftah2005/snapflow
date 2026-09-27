export const API_SCOPES = [
  "downloads:create",
  "downloads:read",
  "downloads:cancel",
  "batches:create",
  "batches:read",
  "batches:cancel",
  "providers:read",
  "account:read",
  "usage:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isValidScope(s: string): s is ApiScope {
  return (API_SCOPES as readonly string[]).includes(s);
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: ApiScope[];
  lastUsedAt?: number;
  expiresAt?: number;
  revokedAt?: number;
  createdAt: number;
}

export interface ApiKeyPublic {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  lastUsedAt?: number;
  expiresAt?: number;
  revokedAt?: number;
  createdAt: number;
}

export interface IdempotencyRecord {
  key: string;
  userId: string;
  apiKeyId: string;
  requestHash: string;
  response: unknown;
  statusCode: number;
  expiresAt: number;
}

export type WebhookEventName =
  | "download.completed"
  | "download.failed"
  | "download.canceled"
  | "batch.completed"
  | "batch.partial"
  | "batch.failed"
  | "batch.canceled"
  | "test.event";

export const WEBHOOK_EVENTS: WebhookEventName[] = [
  "download.completed",
  "download.failed",
  "download.canceled",
  "batch.completed",
  "batch.partial",
  "batch.failed",
  "batch.canceled",
  "test.event",
];

export function isValidWebhookEvent(e: string): e is WebhookEventName {
  return (WEBHOOK_EVENTS as readonly string[]).includes(e);
}

export interface WebhookEndpointRecord {
  id: string;
  userId: string;
  url: string;
  /** Encrypted secret (AES-256-GCM). Decrypt only at send time. */
  secretEncrypted: string;
  events: WebhookEventName[];
  active: boolean;
  consecutiveFailures: number;
  lastDeliveredAt?: number;
  createdAt: number;
}

export interface WebhookDeliveryRecord {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: "DELIVERED" | "FAILED" | "DISABLED";
  httpStatus?: number;
  attempts: number;
  error?: string;
  createdAt: number;
}

export interface ApiStore {
  // keys
  createApiKey(r: ApiKeyRecord): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKeyRecord | undefined>;
  listApiKeys(userId: string): Promise<ApiKeyRecord[]>;
  touchApiKey(id: string, now: number): Promise<void>;
  revokeApiKey(userId: string, id: string): Promise<boolean>;
  countActiveKeys(userId: string): Promise<number>;
  // idempotency
  getIdempotency(userId: string, key: string, now: number): Promise<IdempotencyRecord | undefined>;
  saveIdempotency(r: IdempotencyRecord): Promise<void>;
  purgeExpiredIdempotency(now: number): Promise<number>;
  // webhooks
  createWebhookEndpoint(r: WebhookEndpointRecord): Promise<void>;
  getWebhookEndpoint(id: string): Promise<WebhookEndpointRecord | undefined>;
  listWebhookEndpoints(userId: string): Promise<WebhookEndpointRecord[]>;
  updateWebhookEndpoint(id: string, patch: Partial<WebhookEndpointRecord>): Promise<void>;
  deleteWebhookEndpoint(userId: string, id: string): Promise<boolean>;
  countWebhookEndpoints(userId: string): Promise<number>;
  recordDelivery(r: WebhookDeliveryRecord): Promise<void>;
  listDeliveries(endpointId: string, limit: number): Promise<WebhookDeliveryRecord[]>;
  /** Delete deliveries older than beforeMs (bounded log retention). */
  purgeDeliveries(beforeMs: number): Promise<number>;
}
