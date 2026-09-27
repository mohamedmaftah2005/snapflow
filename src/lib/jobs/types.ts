export const JOB_STATUSES = [
  "PENDING",
  "QUEUED",
  "PROCESSING",
  "UPLOADING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobProvider = "tiktok" | "youtube" | "instagram";

export type JobMediaType = "VIDEO" | "IMAGE" | "AUDIO" | "CAROUSEL" | "STORY";

export interface DownloadJobRecord {
  id: string;
  status: JobStatus;
  provider: JobProvider;
  /** Normalized, SSRF-validated source URL. */
  sourceUrl: string;
  /** Owner for authenticated jobs; undefined for guest jobs. */
  userId?: string;
  /** Effective per-job file cap (plan-aware). Falls back to env default. */
  maxFileSize?: number;
  /** Requested output (server-validated allowlist). Defaults to auto. */
  formatKind?: "auto" | "video" | "audio";
  formatHeight?: number;
  /** Provider's content id (when known). */
  sourceId?: string;
  mediaType?: JobMediaType;
  title?: string;
  thumbnail?: string;
  duration?: number;
  format?: string;
  resolution?: string;
  /** Object-storage key (s3 driver) — never a local path, never exposed raw. */
  fileKey?: string;
  fileSize?: number;
  /** Local-driver only: temp file path. Never sent to the browser. */
  localPath?: string;
  mime?: string;
  attempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  expiresAt: number;
  errorCode?: string;
  errorMessage?: string;
}

export function isTerminalStatus(s: JobStatus): boolean {
  return s === "COMPLETED" || s === "FAILED" || s === "EXPIRED" || s === "CANCELED";
}

/** One stored media artifact belonging to a job. */
export interface DownloadItemRecord {
  id: string;
  jobId: string;
  type: JobMediaType;
  format: string;
  container: string;
  resolution?: string;
  width?: number;
  height?: number;
  /** Object-storage key — never a local path, never exposed raw. */
  fileKey: string;
  fileSize?: number;
  /** Local-driver only: temp file path. Never sent to the browser. */
  localPath?: string;
  expiresAt: number;
}
