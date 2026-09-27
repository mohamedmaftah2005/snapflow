function publicFlag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

/**
 * Centralized feature flags. Server flags stay server-side; only the
 * explicitly public subset is readable in the browser.
 *
 * NOTE: runtime operational flags (maintenance_mode, provider_*,
 * batch_downloads, referrals_enabled, …) live in lib/admin/flags.ts
 * (DB-backed). This module holds only build-time env defaults.
 * serverFlags was removed in Phase 15: newProvider/batchDownload/premium
 * were dead (the DB flags and entitlements are authoritative).
 */
export const publicFlags = {
  ads: publicFlag("NEXT_PUBLIC_ENABLE_ADS"),
  analytics: publicFlag("NEXT_PUBLIC_ENABLE_ANALYTICS"),
} as const;

export type PublicFlags = typeof publicFlags;
