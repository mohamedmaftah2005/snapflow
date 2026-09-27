import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { getAccountStore } from "@/lib/server";
import type { UserRole } from "@/lib/accounts/types";

export type AuditAction =
  | "USER_SUSPENDED"
  | "USER_REACTIVATED"
  | "USER_ROLE_CHANGED"
  | "JOB_RETRIED"
  | "JOB_CANCELED"
  | "JOB_EXPIRED"
  | "PROVIDER_DISABLED"
  | "PROVIDER_ENABLED"
  | "PROVIDER_MAINTENANCE"
  | "QUEUE_PAUSED"
  | "QUEUE_RESUMED"
  | "FLAG_CHANGED"
  | "MAINTENANCE_ENABLED"
  | "MAINTENANCE_DISABLED"
  | "WEBHOOK_RETRIED"
  | "STORAGE_CLEANUP_STARTED"
  | "USAGE_RESET"
  | "API_KEY_REVOKED"
  | "REFERRAL_REVERSED"
  | "AFFILIATE_APPROVED"
  | "AFFILIATE_SUSPENDED"
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_PAUSED"
  | "CAMPAIGN_RESUMED";

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorRole: UserRole;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt: number;
}

export interface AuditStore {
  append(e: AuditEntry): Promise<void>;
  list(opts: {
    action?: string;
    actor?: string;
    target?: string;
    sinceMs?: number;
    limit: number;
    offset: number;
  }): Promise<{ entries: AuditEntry[]; total: number }>;
}

/** Append-only. No update/delete API exists by design. */
export async function audit(input: {
  actorUserId: string | null;
  actorRole: UserRole;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}): Promise<void> {
  const entry = {
    id: `aud_${randomBytes(12).toString("base64url")}`,
    createdAt: Date.now(),
    ...input,
  };
  await getAccountStore().appendAudit(entry);
  logger.info("admin_audit", {
    action: entry.action,
    actor: entry.actorUserId ?? "system",
    target: entry.targetId,
    req: entry.requestId,
  });
}
