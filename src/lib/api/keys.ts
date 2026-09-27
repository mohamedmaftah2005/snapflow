import { createHash, randomBytes } from "node:crypto";
import { generateApiKey, hashApiKey, hashEquals } from "@/lib/api/crypto";
import { getAccountStore, getApiStore } from "@/lib/server";
import { canUse } from "@/lib/billing/plans";
import { getEntitlement } from "@/lib/entitlements";
import { inc } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { toPublicUser } from "@/lib/auth/service";
import type { ApiScope, ApiKeyPublic, WebhookEventName } from "@/lib/api/types";
import type { UserRecord } from "@/lib/accounts/types";

export const MAX_KEYS_FREE = 2;
export const MAX_KEYS_PREMIUM = 10;

export function newApiId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function toPublicKey(r: {
  id: string; name: string; prefix: string; scopes: ApiScope[];
  lastUsedAt?: number; expiresAt?: number; revokedAt?: number; createdAt: number;
}): ApiKeyPublic {
  return { ...r, scopes: [...r.scopes] };
}

/** Create a key. Raw value returned once — never stored, never recoverable. */
export async function createApiKey(
  user: UserRecord,
  input: { name: string; scopes: ApiScope[]; expiresAt?: number }
): Promise<{ record: ApiKeyPublic; raw: string }> {
  const ent = await getEntitlement(user);
  if (!canUse(ent.plan, "apiAccess")) {
    throw Object.assign(new Error("API access requires Premium."), { code: "PLAN_LIMIT_REACHED" });
  }
  const store = getApiStore();
  const max = ent.plan.id === "premium" ? MAX_KEYS_PREMIUM : MAX_KEYS_FREE;
  if ((await store.countActiveKeys(user.id)) >= max) {
    throw Object.assign(new Error(`Key limit reached (${max}). Revoke one first.`), { code: "PLAN_LIMIT_REACHED" });
  }
  const { raw, prefix } = generateApiKey();
  const now = Date.now();
  const record = {
    id: newApiId("key"),
    userId: user.id,
    name: input.name.slice(0, 80),
    prefix,
    keyHash: hashApiKey(raw),
    scopes: [...input.scopes],
    expiresAt: input.expiresAt,
    createdAt: now,
  };
  await store.createApiKey(record);
  logger.info("api_key_created", { user: user.id, key: record.id });
  inc("api_key_created_total");
  return { record: toPublicKey(record), raw };
}

export interface KeyAuth {
  keyId: string;
  user: UserRecord;
  scopes: ApiScope[];
}

/**
 * Bearer authentication. Rejects revoked/expired keys, suspended owners,
 * and plans without API access. Updates lastUsedAt at most hourly.
 */
export async function authenticateApiKey(req: Request): Promise<KeyAuth | { error: string }> {
  const auth = req.headers.get("authorization") ?? "";
  // Keys travel in headers only — never query strings (they leak via logs).
  if (!auth.startsWith("Bearer ") || req.url.includes("api_key=")) {
    return { error: "INVALID_API_KEY" };
  }
  const raw = auth.slice(7).trim();
  if (!/^sf_live_[A-Za-z0-9_-]{32,64}$/.test(raw)) return { error: "INVALID_API_KEY" };
  let rec;
  try {
    rec = await getApiStore().getApiKeyByHash(hashApiKey(raw));
  } catch {
    return { error: "INVALID_API_KEY" };
  }
  if (!rec || !hashEquals(rec.keyHash, hashApiKey(raw))) return { error: "INVALID_API_KEY" };
  const now = Date.now();
  if (rec.revokedAt || (rec.expiresAt && rec.expiresAt < now)) return { error: "INVALID_API_KEY" };
  const user = await getAccountStore().getUserById(rec.userId);
  if (!user || user.status !== "ACTIVE") return { error: "INVALID_API_KEY" };
  const ent = await getEntitlement(user);
  if (!canUse(ent.plan, "apiAccess")) return { error: "PLAN_LIMIT_REACHED" };
  const publicUser = toPublicUser(user);
  if (!rec.lastUsedAt || now - rec.lastUsedAt > 3600_000) {
    await getApiStore().touchApiKey(rec.id, now).catch(() => undefined);
  }
  return { keyId: rec.id, user: publicUser, scopes: rec.scopes };
}

export function requestHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function webhookEventsForPlan(): WebhookEventName[] {
  return [
    "download.completed",
    "download.failed",
    "download.canceled",
    "batch.completed",
    "batch.partial",
    "batch.failed",
    "batch.canceled",
    "test.event",
  ];
}
