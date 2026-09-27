import { validateTikTokUrlInput } from "@/lib/validation/url";
import type { DownloadErrorCode, DownloadJob, MediaResult } from "@/types/downloader";
import type { DownloaderService, ProgressCallback } from "./downloader";

const STEP_DELAY_MS = 700;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMockResult(sourceUrl: string): MediaResult {
  return {
    title: "Coastal morning routine — demo result",
    thumbnail: undefined, // Phase 1 uses a styled placeholder, no external image
    duration: 24,
    source: "tiktok",
    sourceUrl,
    isMock: true,
    downloads: [
      {
        id: "mock-hd",
        label: "Video · HD",
        format: "MP4",
        container: "mp4",
        resolution: "1080p (demo)",
        url: "#demo-hd",
      },
      {
        id: "mock-sd",
        label: "Video · Standard",
        format: "MP4",
        container: "mp4",
        resolution: "720p (demo)",
        url: "#demo-sd",
      },
      {
        id: "mock-audio",
        label: "Audio only",
        format: "MP3",
        container: "mp3",
        url: "#demo-audio",
      },
    ],
  };
}

function toError(code: DownloadErrorCode, message: string): Error & { code: DownloadErrorCode } {
  const err = new Error(message) as Error & { code: DownloadErrorCode };
  err.code = code;
  return err;
}

export const mockDownloader: DownloaderService = {
  async createDownload(rawUrl: string, onProgress: ProgressCallback): Promise<MediaResult> {
    const validation = validateTikTokUrlInput(rawUrl);
    const baseUrl = validation.normalizedUrl ?? rawUrl.trim();
    const jobId = `mock_${Math.random().toString(36).slice(2, 10)}`;

    const emit = (status: DownloadJob["status"]): void => {
      const job: DownloadJob = { id: jobId, status, url: baseUrl };
      onProgress(job);
    };

    emit("validating");
    await wait(STEP_DELAY_MS);

    if (!validation.ok) {
      const code = validation.errorCode ?? "INVALID_URL";
      emit("error");
      throw toError(code, validation.message ?? "Please check the link and try again.");
    }

    // Simulate an occasional transient failure for URLs containing "fail"
    // so error UX can be inspected without backend.
    if (/fail/i.test(baseUrl)) {
      emit("queued");
      await wait(STEP_DELAY_MS);
      emit("processing");
      await wait(STEP_DELAY_MS);
      emit("error");
      throw toError(
        "PROCESSING_FAILED",
        "Something went wrong while processing this link. Please try again."
      );
    }

    emit("queued");
    await wait(STEP_DELAY_MS);
    emit("processing");
    await wait(STEP_DELAY_MS * 2);

    const result = buildMockResult(baseUrl);
    emit("completed");
    return result;
  },
};
