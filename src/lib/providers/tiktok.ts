import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { isAllowedTikTokHost, normalizeTikTokUrl, validateTikTokUrl } from "@/lib/validation/tiktok";
import { audioOutputPath, outputPath, TikTokDownloader } from "@/services/downloader/TikTokDownloader";
import type { DownloadOptions, MediaProvider, ProviderResult } from "./types";

/**
 * TikTok provider. Delegates media fetching to the proven TikTokDownloader;
 * this module owns identity, validation, capabilities, and normalization.
 */
export const tiktokProvider: MediaProvider = {
  id: "tiktok",
  name: "TikTok",
  capabilities: { video: true, audio: true, images: false, slideshow: false, stories: false, live: false },

  supportsHost(host: string): boolean {
    return isAllowedTikTokHost(host.toLowerCase());
  },

  normalizeUrl(raw: string): string {
    return normalizeTikTokUrl(raw);
  },

  async validateUrl(raw: unknown): Promise<string> {
    return validateTikTokUrl(raw);
  },

  async download(normalizedUrl: string, options: DownloadOptions): Promise<ProviderResult> {
    const dl = new TikTokDownloader();
    if (!dl.supports(new URL(normalizedUrl))) throw new AppError("UNSUPPORTED_URL");
    const audioOnly = options.format?.kind === "audio";
    if (audioOnly && !tiktokProvider.capabilities.audio) throw new AppError("UNSUPPORTED_URL");
    const res = await dl.download(normalizedUrl, options.jobId, options.format ?? { kind: "auto" });
    log(options.jobId, "provider normalized", { provider: "tiktok" });
    return {
      provider: "tiktok",
      sourceId: normalizedUrl,
      mediaType: audioOnly ? "AUDIO" : "VIDEO",
      title: res.title,
      description: undefined,
      author: undefined,
      thumbnail: audioOnly ? undefined : res.thumbnail,
      duration: res.duration,
      items: [
        {
          itemId: audioOnly ? "audio" : "video",
          type: audioOnly ? "AUDIO" : "VIDEO",
          format: res.format,
          container: res.container,
          resolution: res.resolution,
          filesize: res.filesize,
          localPath: audioOnly ? audioOutputPath(options.jobId) : outputPath(options.jobId),
        },
      ],
    };
  },
};
