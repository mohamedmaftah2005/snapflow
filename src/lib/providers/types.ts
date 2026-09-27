export type ProviderId = "tiktok" | "youtube" | "instagram";

export type MediaType = "VIDEO" | "IMAGE" | "AUDIO" | "CAROUSEL" | "STORY";

export interface ProviderCapabilities {
  video: boolean;
  audio: boolean;
  images: boolean;
  slideshow: boolean;
  stories: boolean;
  live: boolean;
}

export interface ProviderValidation {
  ok: boolean;
  normalizedUrl?: string;
  errorCode?: "INVALID_URL" | "UNSUPPORTED_URL";
  message?: string;
}

/** One downloadable artifact produced by a provider. */
export interface ProviderItem {
  /** Server-generated, URL-safe. */
  itemId: string;
  type: MediaType;
  format: string;
  container: string;
  resolution?: string;
  width?: number;
  height?: number;
  filesize?: number;
  /** Worker-local temp path. Never exposed to clients. */
  localPath: string;
}

/** Normalized provider result — the only shape the worker understands. */
export interface ProviderResult {
  provider: ProviderId;
  sourceId: string;
  mediaType: MediaType;
  title?: string;
  description?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  items: ProviderItem[];
}

import type { FormatRequest } from "@/lib/media/formats";

export interface DownloadOptions {
  jobId: string;
  timeoutMs: number;
  maxFileSizeBytes: number;
  /** Requested output; providers clamp to what actually exists. */
  format?: FormatRequest;
}

/**
 * Provider contract. yt-dlp and all platform specifics stay inside
 * implementations — callers only see normalized results.
 */
export interface MediaProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** Pure hostname check (no network). */
  supportsHost(host: string): boolean;
  /** Sync allowlist normalization. Throws AppError(INVALID_URL/UNSUPPORTED_URL). */
  normalizeUrl(raw: string): string;
  /** Authoritative validation incl. DNS-rebinding guard. */
  validateUrl(raw: unknown): Promise<string>;
  /** Full fetch: metadata + media to worker-local temp files. */
  download(normalizedUrl: string, options: DownloadOptions): Promise<ProviderResult>;
}
