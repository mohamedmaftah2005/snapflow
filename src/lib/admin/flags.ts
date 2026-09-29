import { env } from "@/lib/config/env";
import { getAccountStore } from "@/lib/server";
import type { ProviderId } from "@/lib/providers/types";

/**
 * Centralized feature flags. The database wins over env defaults; values are
 * cached in-process and refreshed every 30s (eventual consistency across
 * instances — documented, safe for operational toggles).
 *
 * Well-known keys:
 *   maintenance_mode, provider_<id>_enabled, provider_<id>_maintenance,
 *   guest_downloads_enabled, registration_enabled, referrals_enabled,
 *   affiliates_enabled, api_enabled, marketing_enabled
 */
const REFRESH_MS = 30_000;

let cache = new Map<string, boolean>();
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  if (inflight) {
    await inflight;
    return;
  }
  inflight = (async () => {
    try {
      const rows = await getAccountStore().listFlags();
      const next = new Map<string, boolean>();
      for (const r of rows) next.set(r.key, r.enabled);
      cache = next;
      loadedAt = Date.now();
    } catch {
      // DB unreachable: keep last cache (or empty → env defaults).
    } finally {
      inflight = null;
    }
  })();
  await inflight;
}

async function ensureFresh(): Promise<void> {
  if (Date.now() - loadedAt > REFRESH_MS) await refresh();
}

/** Raw flag: DB row wins, otherwise envDefault. */
export async function isEnabled(key: string, envDefault: boolean): Promise<boolean> {
  await ensureFresh();
  return cache.get(key) ?? envDefault;
}

export async function setFlag(key: string, enabled: boolean, updatedBy: string | null): Promise<void> {
  await getAccountStore().setFlag(key, enabled, updatedBy);
  cache.set(key, enabled);
  loadedAt = Date.now();
}

export async function listFlagsWithDefaults(
  defs: { key: string; envDefault: boolean; description: string }[]
): Promise<{ key: string; enabled: boolean; source: "db" | "env"; description: string }[]> {
  await ensureFresh();
  return defs.map((d) => {
    const v = cache.get(d.key);
    return { ...d, enabled: v ?? d.envDefault, source: v === undefined ? "env" : "db" };
  });
}

/** Synchronous read of the last-loaded cache (for sync call sites). */
export function cachedFlag(key: string, envDefault: boolean): boolean {
  return cache.get(key) ?? envDefault;
}

/** Test-only reset. */
export function __resetFlagCache(): void {
  cache = new Map();
  loadedAt = 0;
  inflight = null;
}

export const FLAG_DEFS = [
  { key: "maintenance_mode", envDefault: false, description: "Block new public downloads with a maintenance message." },
  { key: "provider_tiktok_enabled", envDefault: env.enableTikTok, description: "TikTok provider availability." },
  { key: "provider_tiktok_maintenance", envDefault: false, description: "TikTok degraded notice; jobs rejected while on." },
  { key: "provider_youtube_enabled", envDefault: env.enableYoutube, description: "YouTube provider availability." },
  { key: "provider_youtube_maintenance", envDefault: false, description: "YouTube degraded notice; jobs rejected while on." },
  { key: "provider_instagram_enabled", envDefault: env.enableInstagram, description: "Instagram provider availability." },
  { key: "provider_instagram_maintenance", envDefault: false, description: "Instagram degraded notice; jobs rejected while on." },
  { key: "guest_downloads_enabled", envDefault: env.enableGuestDownloads, description: "Anonymous downloads." },
  { key: "registration_enabled", envDefault: false, description: "New account registration. Closed by default; existing accounts and admin login are unaffected. Re-enable via the admin flags panel or a feature_flags DB row to create new accounts." },
  { key: "batch_downloads", envDefault: true, description: "Multi-URL batch workspace." },
  { key: "audio_extraction", envDefault: true, description: "MP3 audio extraction via FFmpeg." },
  { key: "advanced_quality", envDefault: true, description: "Quality selection beyond Auto." },
  { key: "zip_downloads", envDefault: true, description: "Batch ZIP packaging." },
  { key: "download_cancellation", envDefault: true, description: "User-initiated job cancellation." },
  { key: "saved_downloads", envDefault: true, description: "Save/unsave download bookmarks." },
  { key: "referrals_enabled", envDefault: true, description: "Referral links, attribution, and trial rewards." },
  { key: "affiliates_enabled", envDefault: true, description: "Affiliate applications and commission tracking." },
  { key: "api_enabled", envDefault: true, description: "Public developer API (v1). Off = all keyed requests rejected." },
  { key: "marketing_enabled", envDefault: true, description: "Marketing email + campaign runs. Transactional mail unaffected." },
  { key: "metadata_strip", envDefault: true, description: "Strip container metadata from downloaded media (lossless remux). Off = deliver files as received." },
];

/** Provider status honoring runtime flags (env = default, DB = override). */
export function providerStatus(id: ProviderId): "enabled" | "disabled" | "maintenance" {
  if (cachedFlag(`provider_${id}_maintenance`, false)) return "maintenance";
  const envDefaults: Record<ProviderId, boolean> = {
    tiktok: env.enableTikTok,
    youtube: env.enableYoutube,
    instagram: env.enableInstagram,
  };
  return cachedFlag(`provider_${id}_enabled`, envDefaults[id]) ? "enabled" : "disabled";
}

export async function maintenanceMode(): Promise<boolean> {
  return isEnabled("maintenance_mode", false);
}
