export type DownloadStatus =
  | "idle"
  | "validating"
  | "queued"
  | "processing"
  | "completed"
  | "error";

export type DownloadErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "PROCESSING_FAILED"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE"
  | "PLAN_LIMIT_REACHED";

export interface DownloadOption {
  id: string;
  label: string;
  format: string;
  container: string;
  resolution?: string;
  filesize?: number;
  url: string;
  expiresAt?: string;
}

export interface MediaResult {
  title: string;
  thumbnail?: string;
  duration?: number;
  /** Provider id from the normalized result model (e.g. "tiktok"). */
  provider?: string;
  mediaType?: "VIDEO" | "IMAGE" | "AUDIO" | "CAROUSEL" | "STORY";
  source: "tiktok";
  sourceUrl: string;
  isMock?: boolean;
  downloads: DownloadOption[];
}

export interface DownloadJob {
  id: string;
  status: DownloadStatus;
  url: string;
  errorCode?: DownloadErrorCode;
  errorMessage?: string;
  result?: MediaResult;
}

export interface ValidationResult {
  ok: boolean;
  normalizedUrl?: string;
  errorCode?: DownloadErrorCode;
  message?: string;
}
