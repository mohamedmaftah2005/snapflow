import { tiktokProvider } from "@/lib/providers/tiktok";
import { youtubeProvider } from "@/lib/providers/youtube";
import { providerStatus } from "@/lib/admin/flags";
import type { MediaProvider, ProviderId } from "./types";

export type ProviderStatus = "enabled" | "disabled" | "maintenance";

export interface ProviderEntry {
  provider: MediaProvider;
  status: ProviderStatus;
  /** Short content-type summary for the Supported-platforms UI. */
  contentTypes: string[];
}

function statusFor(id: ProviderId): ProviderStatus {
  return providerStatus(id);
}

/**
 * Registry is the only place provider modules are wired together.
 * User input (URLs) never selects a module directly — resolve() maps
 * explicit hostname rules to a registered, enabled provider or null.
 */
class ProviderRegistry {
  private entries = new Map<ProviderId, ProviderEntry>();

  register(entry: ProviderEntry): void {
    this.entries.set(entry.provider.id, entry);
  }

  /** All registered providers (any status) — for health/metrics. */
  all(): ProviderEntry[] {
    return [...this.entries.values()].map((e) => ({
      ...e,
      status: statusFor(e.provider.id),
    }));
  }

  /** Providers safe to advertise in UI. */
  enabled(): ProviderEntry[] {
    return this.all().filter((e) => e.status === "enabled");
  }

  get(id: ProviderId): MediaProvider | null {
    const e = this.entries.get(id);
    if (!e || statusFor(id) !== "enabled") return null;
  return e.provider;
  }

  statusOf(id: ProviderId): ProviderStatus {
    if (!this.entries.get(id)) return "disabled";
    return statusFor(id);
  }

  /** Map a raw URL to its enabled provider, or null. Never throws. */
  resolve(raw: string): MediaProvider | null {
    let host: string;
    try {
      host = new URL(raw.trim()).hostname.toLowerCase();
    } catch {
      return null;
    }
    for (const e of this.entries.values()) {
      if (statusFor(e.provider.id) !== "enabled") continue;
      try {
        if (e.provider.supportsHost(host)) return e.provider;
      } catch {
        // a provider's matcher must never break resolution
      }
    }
    return null;
  }

  /** Test-only: fresh registry. */
  static isolated(): ProviderRegistry {
    return new ProviderRegistry();
  }
}

let shared: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!shared) {
    // Registration order defines UI order.
    shared = new ProviderRegistry();
    shared.register({ provider: tiktokProvider, status: "enabled", contentTypes: ["Videos"] });
    shared.register({ provider: youtubeProvider, status: "disabled", contentTypes: ["Videos"] });
  }
  return shared;
}

/** Test-only reset. */
export function __resetProviderRegistry(): void {
  shared = null;
}
