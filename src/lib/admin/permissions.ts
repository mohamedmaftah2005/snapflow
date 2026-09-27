import type { UserRole } from "@/lib/accounts/types";

export type Permission =
  | "ADMIN_VIEW"
  | "USER_VIEW"
  | "USER_MANAGE"
  | "JOB_VIEW"
  | "JOB_MANAGE"
  | "QUEUE_VIEW"
  | "QUEUE_MANAGE"
  | "PROVIDER_VIEW"
  | "PROVIDER_MANAGE"
  | "BILLING_VIEW"
  | "ABUSE_VIEW"
  | "ABUSE_MANAGE"
  | "FLAG_MANAGE"
  | "AUDIT_VIEW"
  | "SYSTEM_VIEW";

/**
 * Least-privilege matrix. SUPPORT reads users/jobs but changes nothing;
 * OPERATOR additionally manages jobs/queues/providers; ADMIN has all.
 */
const MATRIX: Record<UserRole, Permission[]> = {
  USER: [],
  SUPPORT: ["ADMIN_VIEW", "USER_VIEW", "JOB_VIEW", "BILLING_VIEW", "ABUSE_VIEW", "AUDIT_VIEW", "SYSTEM_VIEW", "PROVIDER_VIEW", "QUEUE_VIEW"],
  OPERATOR: [
    "ADMIN_VIEW", "USER_VIEW", "JOB_VIEW", "JOB_MANAGE", "BILLING_VIEW",
    "ABUSE_VIEW", "ABUSE_MANAGE", "AUDIT_VIEW", "SYSTEM_VIEW",
    "PROVIDER_VIEW", "PROVIDER_MANAGE", "QUEUE_VIEW", "QUEUE_MANAGE",
  ],
  ADMIN: [
    "ADMIN_VIEW", "USER_VIEW", "USER_MANAGE", "JOB_VIEW", "JOB_MANAGE",
    "BILLING_VIEW", "ABUSE_VIEW", "ABUSE_MANAGE", "AUDIT_VIEW", "SYSTEM_VIEW",
    "PROVIDER_VIEW", "PROVIDER_MANAGE", "QUEUE_VIEW", "QUEUE_MANAGE", "FLAG_MANAGE",
  ],
};

export function hasPermission(role: UserRole, perm: Permission): boolean {
  return MATRIX[role]?.includes(perm) ?? false;
}

export function permissionsFor(role: UserRole): Permission[] {
  return [...(MATRIX[role] ?? [])];
}
