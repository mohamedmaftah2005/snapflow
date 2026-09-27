import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { assertSafeDns, assertSafeHost, parseHttpUrl } from "@/lib/validation/net";
import { mapYtDlpFailure, runBinary } from "@/services/downloader/ytdlp";
import { audioExtractArgs, videoFormatSelector } from "@/lib/media/formats";
import { fetchYtDlpMetadata } from "./ytdlp";
import type { DownloadOptions, MediaProvider, ProviderResult } from "./types";

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"]);
const KEEP_PARAMS = new Set(["v", "t", "list"]);

/**
 * YouTube provider. Implemented and unit-tested, but DISABLED by default
 * (ENABLE_YOUTUBE=false) until live verification on permitted content,
 * per the rollout policy in docs/providers.md. No UI or landing page
 * advertises it while disabled.
 */
export const youtubeProvider: MediaProvider = {
  id: "youtube",
  name: "YouTube",
  capabilities: { video: true, audio: true, images: false, slideshow: false, stories: false, live: false },

  supportsHost(host: string): boolean {
    return HOSTS.has(host.toLowerCase());
  },

  normalizeUrl(raw: string): string {
    const parsed = parseHttpUrl(raw);
    const host = parsed.hostname.toLowerCase();
    assertSafeHost(host);
    if (!HOSTS.has(host)) throw new AppError("UNSUPPORTED_URL");
    if ((parsed.pathname ?? "").length < 2 && host !== "youtu.be") throw new AppError("INVALID_URL");
    if (host === "youtu.be" && parsed.pathname.split("/").filter(Boolean).length < 1) {
      throw new AppError("INVALID_URL");
    }
    // Keep only playback-identifying params; drop tracking.
    const kept = new URLSearchParams();
    for (const [k, v] of parsed.searchParams) {
      if (KEEP_PARAMS.has(k)) kept.set(k, v);
    }
    parsed.search = kept.toString();
    parsed.protocol = "https:";
    parsed.hash = "";
    const out = parsed.toString();
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const u = new URL(out);
      if (!u.searchParams.get("v") && !u.pathname.startsWith("/shorts/") && !u.pathname.startsWith("/embed/")) {
        throw new AppError("INVALID_URL", "Only direct video links are supported.");
      }
    }
    return out;
  },

  async validateUrl(raw: unknown): Promise<string> {
    if (typeof raw !== "string") throw new AppError("INVALID_URL");
    const normalized = youtubeProvider.normalizeUrl(raw);
    await assertSafeDns(new URL(normalized).hostname);
    return normalized;
  },

  async download(normalizedUrl: string, options: DownloadOptions): Promise<ProviderResult> {
    const meta = await fetchYtDlpMetadata(normalizedUrl, `yt:${options.jobId}`);
    const audioOnly = options.format?.kind === "audio";
    if (audioOnly) {
      const { checkBinaryAvailable } = await import("@/services/downloader/ytdlp");
      if (!(await checkBinaryAvailable(env.ffmpegPath, ["-version"]))) {
        throw new AppError("FFMPEG_UNAVAILABLE");
      }
    }
    const dir = env.tempDir || path.join(os.tmpdir(), "snapflow");
    const jobDir = path.join(dir, options.jobId);
    await fs.mkdir(jobDir, { recursive: true, mode: 0o700 });
    const localPath = path.join(jobDir, audioOnly ? "audio.mp3" : "video.mp4");
    const formatFlag =
      options.format?.kind === "video"
        ? videoFormatSelector(options.format.maxHeight)
        : "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b";
    log(options.jobId, "yt-dlp download started", { provider: "youtube" });
    try {
      const res = await runBinary(
        env.ytDlpPath,
        [
          "--no-playlist",
          "--no-warnings",
          "--socket-timeout",
          "15",
          ...(audioOnly ? audioExtractArgs() : ["-f", formatFlag]),
          "--max-filesize",
          String(options.maxFileSizeBytes),
          ...(audioOnly ? [] : ["--merge-output-format", "mp4"]),
          "-o",
          localPath,
          normalizedUrl,
        ],
        { timeoutMs: options.timeoutMs, cwd: jobDir }
      );
      if (res.exitCode !== 0) throw mapYtDlpFailure(res.stderr, res.exitCode);
      const stat = await fs.stat(localPath).catch(() => null);
      if (!stat || stat.size === 0) throw new AppError("PROCESSING_FAILED", "Empty output");
      if (stat.size > options.maxFileSizeBytes) {
        await fs.rm(localPath, { force: true }).catch(() => undefined);
        throw new AppError("FILE_TOO_LARGE");
      }
      return {
        provider: "youtube",
        sourceId: meta.sourceId,
        mediaType: audioOnly ? "AUDIO" : "VIDEO",
        title: meta.title,
        description: meta.description,
        author: meta.author,
        thumbnail: audioOnly ? undefined : meta.thumbnail,
        duration: meta.duration,
        items: [
          {
            itemId: audioOnly ? "audio" : "video",
            type: audioOnly ? "AUDIO" : "VIDEO",
            format: audioOnly ? "MP3" : "MP4",
            container: audioOnly ? "mp3" : "mp4",
            filesize: stat.size,
            localPath,
          },
        ],
      };
    } catch (err) {
      await fs.rm(localPath, { force: true }).catch(() => undefined);
      throw err;
    }
  },
};
