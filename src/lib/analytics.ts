export type AnalyticsEvent =
  | "page_view"
  | "paste_url"
  | "download_button_clicked"
  | "download_started"
  | "download_job_created"
  | "download_completed"
  | "download_failed"
  | "download_expired"
  | "batch_created"
  | "batch_completed"
  | "batch_partial"
  | "batch_failed"
  | "quality_selected"
  | "audio_requested"
  | "zip_created"
  | "zip_downloaded"
  | "download_retried"
  | "download_again"
  | "download_canceled"
  | "history_viewed"
  | "download_deleted"
  | "referral_link_copied"
  | "onboarding_started"
  | "onboarding_skipped"
  | "onboarding_completed"
  | "first_download_completed"
  | "checkout_started";

/** Only non-sensitive, documented properties. Never full URLs or content. */
export interface AnalyticsProps {
  provider?: string;
  mediaType?: string;
  status?: string;
  errorCode?: string;
  durationMs?: number;
  path?: string;
  authenticated?: boolean;
  plan?: string;
}

export interface AnalyticsProvider {
  readonly name: string;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
}

const CONSENT_KEY = "snapflow-consent";

function flagsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true";
}

export function hasConsented(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '{"analytics":true}';
  } catch {
    return false;
  }
}

export function setConsent(allowed: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: allowed }));
  } catch {
    // storage unavailable — analytics stay off
  }
}

class ConsoleProvider implements AnalyticsProvider {
  readonly name = "console";
  track(event: AnalyticsEvent, props?: AnalyticsProps): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[analytics] ${event}`, props ?? {});
    }
  }
}

let provider: AnalyticsProvider = new ConsoleProvider();
let pageViewedForPath: string | null = null;
let accountCtx: { authenticated?: boolean; plan?: string } = {};

export function setAccountContext(ctx: { authenticated?: boolean; plan?: string }): void {
  accountCtx = { ...accountCtx, ...ctx };
}

export function setProvider(p: AnalyticsProvider): void {
  provider = p;
}

/** Test-only: inspect the active provider. */
export function getProvider(): AnalyticsProvider {
  return provider;
}

function scrub(props?: AnalyticsProps): AnalyticsProps | undefined {
  if (!props) return undefined;
  const { provider, mediaType, status, errorCode, durationMs, path } = props;
  // Explicit allowlist — anything else (URLs, tokens, emails) can never leak.
  return { provider, mediaType, status, errorCode, durationMs, path };
}

export interface TrackContext {
  authenticated?: boolean;
  plan?: string;
}

/**
 * Central tracking entry. Drops events unless the feature flag is on AND
 * the user consented. Guards page_view against duplicate fires per path.
 */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!flagsEnabled() || !hasConsented()) return;
  if (event === "page_view" && props?.path) {
    if (pageViewedForPath === props.path) return;
    pageViewedForPath = props.path;
  }
  provider.track(event, { ...scrub(props), ...accountCtx } as AnalyticsProps);
}

/** Test-only reset. */
export function __resetAnalytics(): void {
  pageViewedForPath = null;
  accountCtx = {};
  provider = new ConsoleProvider();
}
