import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

/** HMAC-SHA256 with a server-side pepper. Pepper missing → fail fast. */
export function hashApiKey(raw: string): string {
  const pepper = env.apiKeyPepper;
  if (!pepper) throw new Error("API_KEY_PEPPER is required");
  return createHmac("sha256", pepper).update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; prefix: string } {
  const raw = `sf_live_${randomBytes(32).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 16) };
}

export function hashEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM with a key derived from WEBHOOK_SECRET_KEY. */
function webhookKey(): Buffer {
  const secret = env.webhookSecretKey;
  if (!secret) throw new Error("WEBHOOK_SECRET_KEY is required");
  return createHash("sha256").update(secret).digest();
}

export function encryptWebhookSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", webhookKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${ct.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
}

export function decryptWebhookSecret(enc: string): string {
  const [ivB, ctB, tagB] = enc.split(":");
  if (!ivB || !ctB || !tagB) throw new Error("Malformed secret");
  const decipher = createDecipheriv("aes-256-gcm", webhookKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Webhook payload signature: HMAC-SHA256(secret, `${timestamp}.${rawBody}`). */
export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}
