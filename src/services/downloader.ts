import type { DownloadJob, DownloadStatus, MediaResult } from "@/types/downloader";

export type ProgressCallback = (job: DownloadJob) => void;

export interface CreateOptions {
  format?: { kind: "auto" } | { kind: "video"; maxHeight: number } | { kind: "audio" };
}

export interface DownloaderService {
  createDownload(url: string, onProgress: ProgressCallback, opts?: CreateOptions): Promise<MediaResult>;
  cancel?(jobId?: string): void;
}

/**
 * Future API-backed implementation will:
 *   POST /api/download -> { jobId }
 *   poll GET /api/download/[jobId] until COMPLETED/FAILED
 * and map the response onto DownloadJob / MediaResult.
 * The UI must only depend on DownloaderService, never on mock internals.
 */
export function mapApiStatusToUi(status: string): DownloadStatus {
  switch (status) {
    case "PENDING":
      return "queued";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "error";
    default:
      return "processing";
  }
}
