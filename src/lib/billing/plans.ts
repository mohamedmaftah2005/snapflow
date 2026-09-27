export type PlanId = "free" | "premium";

export interface PlanCapabilities {
  id: PlanId;
  dailyDownloads: number | null; // null = unbounded (still rate-limited)
  maxFileSizeBytes: number | null;
  priorityQueue: boolean;
  apiAccess: boolean;
  batchProcessing: boolean;
}

/**
 * Capability model for Free vs Premium. Plans resolve through the
 * entitlement layer (`lib/entitlements.ts`) — never hardcoded branches.
 * Only capabilities actually implemented are listed here.
 */
export const PLANS: Record<PlanId, PlanCapabilities> = {
  free: {
    id: "free",
    dailyDownloads: 20,
    maxFileSizeBytes: 100 * 1024 * 1024,
    priorityQueue: false,
    apiAccess: false,
    batchProcessing: false,
  },
  premium: {
    id: "premium",
    dailyDownloads: null,
    maxFileSizeBytes: 500 * 1024 * 1024,
    priorityQueue: true,
    apiAccess: true,
    batchProcessing: true,
  },
};

export function getPlanForRequest(): PlanCapabilities {
  // Legacy stub: prefer getEntitlement() which resolves real subscriptions.
  return PLANS.free;
}

export function canUse(cap: PlanCapabilities, feature: "priorityQueue" | "apiAccess" | "batchProcessing"): boolean {
  return cap[feature];
}

/** Anonymous users: strict server-side daily bucket (see entitlements). */
export const GUEST_DAILY_DOWNLOADS = 5;

/**
 * Effective per-plan file cap: the service enforces min(plan, env), so
 * pricing and any other display must use this — never the plan ceiling.
 * Pure for testability; env cap is passed in by the caller.
 */
export function effectiveFileCapMB(planMaxBytes: number | null, envCapBytes: number): number {
  const planCap = planMaxBytes ?? Number.POSITIVE_INFINITY;
  return Math.round(Math.min(planCap, envCapBytes) / 1024 / 1024);
}
