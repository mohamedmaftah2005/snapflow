import { env } from "@/lib/config/env";
import { getDisplayProviders, type ProviderDisplay } from "@/lib/providers/client";

// SERVER-ONLY: never import from a "use client" module (it reads
// non-public env). Only server components may use this helper.

/**
 * Server-only display list: intersects the advertised
 * (NEXT_PUBLIC_PROVIDERS) list with backend capability (ENABLE_*).
 * The UI can never advertise a provider the backend will reject —
 * misconfiguration degrades to showing fewer platforms, not to
 * promising unsupported downloads.
 */
export function getEnabledDisplayProviders(): ProviderDisplay[] {
  const capable: Record<string, boolean> = {
    tiktok: env.enableTikTok,
    youtube: env.enableYoutube,
    instagram: env.enableInstagram,
  };
  const shown = getDisplayProviders().filter((p) => capable[p.id] !== false);
  return shown.length > 0 ? shown : getDisplayProviders().slice(0, 1);
}
