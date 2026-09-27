"use client";

import type { DownloadErrorCode, DownloadJob, DownloadStatus, MediaResult } from "@/types/downloader";
import type { CreateOptions, DownloaderService, ProgressCallback } from "./downloader";
import { track } from "@/lib/analytics";

interface ApiDownloadItem {
  id: string;
  label: string;
  format: string;
  container: string;
  resolution?: string;
  filesize?: number;
  url: string;
}

interface CreateResponse {
  success: boolean;
  data?: { jobId: string };
  error?: { code: string; message: string };
}

interface StatusResponse {
  success: boolean;
  data?: {
    jobId: string;
    status: string;
    provider?: string;
    media?: {
      title: string;
      thumbnail?: string;
      duration?: number;
      provider?: string;
      mediaType?: MediaResult["mediaType"];
      downloads: ApiDownloadItem[];
    };
  };
  error?: { code: string; message: string };
}

const POLL_DELAYS_MS = [1000, 1000, 2000, 2000, 3000, 3000, 3000, 3000];
const MAX_WAIT_MS = 120_000;

function toUiError(code: string, message: string): Error & { code: DownloadErrorCode } {
  const allowed: DownloadErrorCode[] = [
    "INVALID_URL",
    "UNSUPPORTED_URL",
    "PROCESSING_FAILED",
    "RATE_LIMITED",
    "TEMPORARILY_UNAVAILABLE",
    "PLAN_LIMIT_REACHED",
  ];
  const safe: DownloadErrorCode = (allowed as string[]).includes(code)
    ? (code as DownloadErrorCode)
    : "PROCESSING_FAILED";
  const err = new Error(message) as Error & { code: DownloadErrorCode };
  err.code = safe;
  return err;
}

function mapServerStatus(s: string): DownloadStatus {
  switch (s) {
    case "QUEUED":
    case "PENDING":
      return "queued";
    case "UPLOADING":
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    default:
      return "processing";
  }
}

let activeController: AbortController | null = null;

async function fetchJson(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { ...init, signal });
  try {
    return await res.json();
  } catch {
    throw toUiError("PROCESSING_FAILED", "Something went wrong while processing this link. Please try again.");
  }
}

export const apiDownloader: DownloaderService = {
  cancel(): void {
    activeController?.abort();
    activeController = null;
  },

  async createDownload(rawUrl: string, onProgress: ProgressCallback, opts?: CreateOptions): Promise<MediaResult> {
    const url = rawUrl.trim();
    const t0 = Date.now();
    const format = opts?.format ?? { kind: "auto" as const };
    if (format.kind !== "auto") {
      track(format.kind === "audio" ? "audio_requested" : "quality_selected", {
        provider: "tiktok",
        status: format.kind === "video" ? String((format as { maxHeight: number }).maxHeight) : undefined,
      });
    }
    const controller = new AbortController();
    activeController = controller;
    const { signal } = controller;
    const emit = (status: DownloadJob["status"]): void => {
      onProgress({ id: "api", status, url });
    };
    const fail = (code: string, message: string): never => {
      emit("error");
      const err = toUiError(code, message);
      if (/expired/i.test(message)) track("download_expired", { provider: "tiktok" });
      else track("download_failed", { provider: "tiktok", errorCode: err.code });
      throw err;
    };

    emit("validating");
    let created: CreateResponse;
    try {
      created = (await fetchJson(
        "/api/download",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, ...(format.kind === "auto" ? {} : { format }) }),
        },
        signal
      )) as CreateResponse;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        emit("idle");
        throw toUiError("TEMPORARILY_UNAVAILABLE", "Download cancelled.");
      }
      emit("error");
      throw toUiError("TEMPORARILY_UNAVAILABLE", "Our service is busy. Please try again shortly.");
    }
    if (!created.success || !created.data?.jobId) {
      fail(created.error?.code ?? "PROCESSING_FAILED", created.error?.message ?? "Please try again.");
    }
    const jobId = (created.data as { jobId: string }).jobId;
    track("download_job_created", { provider: "tiktok" });
    const emitJob = (status: DownloadJob["status"]): void => {
      onProgress({ id: jobId, status, url });
    };

    // Poll with 1s → 2s → 3s backoff. Transient network/5xx retries; job FAILED stops.
    const started = Date.now();
    let attempt = 0;
    let networkRetries = 0;
    for (;;) {
      if (signal.aborted) {
        emit("idle");
        throw toUiError("TEMPORARILY_UNAVAILABLE", "Download cancelled.");
      }
      if (Date.now() - started > MAX_WAIT_MS) {
        fail("TIMEOUT" as string, "Processing took too long. Please try again.");
      }
      const delay = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] as number;
      await new Promise((r) => setTimeout(r, delay));
      if (signal.aborted) {
        emit("idle");
        throw toUiError("TEMPORARILY_UNAVAILABLE", "Download cancelled.");
      }
      attempt += 1;

      let st: StatusResponse;
      try {
        st = (await fetchJson(`/api/download/${jobId}`, { method: "GET" }, signal)) as StatusResponse;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          emit("idle");
          throw toUiError("TEMPORARILY_UNAVAILABLE", "Download cancelled.");
        }
        networkRetries += 1;
        if (networkRetries > 5) {
          fail("TEMPORARILY_UNAVAILABLE", "Our service is busy. Please try again shortly.");
        }
        continue; // transient network failure — retry
      }

      if (st.success && st.data) {
        const s = st.data.status;
        const provider = (st.data.provider ?? st.data.media?.provider ?? "tiktok") as "tiktok";
        if (s === "COMPLETED" && st.data.media) {
          const m = st.data.media;
          emitJob("completed");
          activeController = null;
          track("download_completed", { provider, mediaType: m.mediaType, durationMs: Date.now() - t0 });
          return {
            title: m.title,
            thumbnail: m.thumbnail,
            duration: m.duration,
            provider: m.provider,
            mediaType: m.mediaType,
            source: "tiktok",
            sourceUrl: url,
            downloads: m.downloads.map((x) => ({
              id: x.id,
              label: x.label,
              format: x.format,
              container: x.container,
              resolution: x.resolution,
              filesize: x.filesize,
              url: x.url,
            })),
          };
        }
        emitJob(mapServerStatus(s));
        continue;
      }
      // Terminal failure (FAILED / EXPIRED) — stop polling.
      fail(st.error?.code ?? "PROCESSING_FAILED", st.error?.message ?? "The media could not be processed.");
    }
  },
};
