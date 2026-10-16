import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { supportsTikTokUrl } from "@/lib/validation/tiktok";
import { log } from "@/lib/logger";
import { mapYtDlpFailure, runBinary, checkBinaryAvailable } from "./ytdlp";
import type { MediaDownloader, MediaDownloadResult, MediaMetadata } from "./types";
import { audioExtractArgs, videoFormatSelector, type FormatRequest } from "@/lib/media/formats";

function baseTempDir(): string {
  return env.tempDir && env.tempDir.length > 0 ? env.tempDir : path.join(os.tmpdir(), "snapflow");
}

/**
 * Shared network tuning for every yt-dlp spawn. Fragmented (HLS/DASH)
 * downloads fetch pieces in parallel instead of serially; bounded retries
 * fail fast on dead links instead of hanging through yt-dlp's long
 * defaults. Single-file progressive downloads are unaffected.
 */
const FAST_NET_ARGS = [
  "--concurrent-fragments",
  "4",
  "--retries",
  "3",
  "--fragment-retries",
  "3",
];

export function jobDir(jobId: string): string {
  return path.join(baseTempDir(), jobId);
}

export function outputPath(jobId: string): string {
  return path.join(jobDir(jobId), "media.mp4");
}

export function audioOutputPath(jobId: string): string {
  return path.join(jobDir(jobId), "audio.mp3");
}

async function ensureJobDir(jobId: string): Promise<void> {
  await fs.mkdir(jobDir(jobId), { recursive: true, mode: 0o700 });
}

interface YtDlpJson {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  uploader?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
  thumbnails?: unknown;
}

function pickThumbnail(j: YtDlpJson): string | undefined {
  if (typeof j.thumbnail === "string" && j.thumbnail.startsWith("http")) return j.thumbnail;
  if (Array.isArray(j.thumbnails) && j.thumbnails.length > 0) {
    const last = j.thumbnails[j.thumbnails.length - 1] as { url?: unknown };
    if (typeof last?.url === "string" && last.url.startsWith("http")) return last.url;
  }
  return undefined;
}

function toMetadata(j: YtDlpJson, sourceUrl: string): MediaMetadata {
  return {
    id: typeof j.id === "string" ? j.id : "unknown",
    title: typeof j.title === "string" ? j.title.slice(0, 300) : undefined,
    description: typeof j.description === "string" ? j.description.slice(0, 2000) : undefined,
    uploader: typeof j.uploader === "string" ? j.uploader.slice(0, 200) : undefined,
    duration: typeof j.duration === "number" && Number.isFinite(j.duration) ? Math.round(j.duration) : undefined,
    thumbnail: pickThumbnail(j),
    sourceUrl,
  };
}

export class TikTokDownloader implements MediaDownloader {
  supports(url: URL): boolean {
    return supportsTikTokUrl(url.toString());
  }

  async getMetadata(normalizedUrl: string): Promise<MediaMetadata> {
    const jobId = `meta-${Date.now()}`;
    log(jobId, "yt-dlp metadata started");
    const res = await runBinary(
      env.ytDlpPath,
      ["--dump-single-json", "--no-playlist", "--no-warnings", "--socket-timeout", "10", ...FAST_NET_ARGS, normalizedUrl],
      { timeoutMs: Math.min(env.jobTimeoutMs, 45_000) }
    );
    if (res.exitCode !== 0) throw mapYtDlpFailure(res.stderr, res.exitCode);
    let parsed: YtDlpJson;
    try {
      parsed = JSON.parse(res.stdout) as YtDlpJson;
    } catch {
      throw new AppError("PROCESSING_FAILED", "Could not parse metadata");
    }
    log(jobId, "metadata received");
    return toMetadata(parsed, normalizedUrl);
  }

  async download(
    normalizedUrl: string,
    jobId: string,
    format: FormatRequest = { kind: "auto" }
  ): Promise<MediaDownloadResult> {
    await ensureJobDir(jobId);
    const audioOnly = format.kind === "audio";
    if (audioOnly && !(await checkBinaryAvailable(env.ffmpegPath, ["-version"]))) {
      throw new AppError("FFMPEG_UNAVAILABLE");
    }
    const out = audioOnly ? audioOutputPath(jobId) : outputPath(jobId);
    // Auto = highest quality first: best video + best audio merged
    // (fallback: best single file). Container-first selectors like
    // mp4/best[ext=mp4] can lock a lower-res mp4 when the top stream is
    // webm; --merge-output-format mp4 below still guarantees mp4 output.
    const formatFlag =
      format.kind === "video" ? videoFormatSelector(format.maxHeight) : "bv*+ba/b";
    // Title/thumbnail/duration are display-only: fetch them CONCURRENTLY
    // with the download instead of sequentially after it (used to add a
    // full extra yt-dlp round trip per job). Best-effort, never fatal.
    const metaPromise = this.getMetadata(normalizedUrl).catch(() => null);
    log(jobId, "yt-dlp download started");
    try {
      const res = await runBinary(
        env.ytDlpPath,
        [
          "--no-playlist",
          "--no-warnings",
          "--socket-timeout",
          "15",
          ...FAST_NET_ARGS,
          ...(audioOnly ? audioExtractArgs() : ["-f", formatFlag]),
          "--max-filesize",
          String(env.maxFileSizeBytes),
          ...(audioOnly ? [] : ["--merge-output-format", "mp4"]),
          "-o",
          out,
          normalizedUrl,
        ],
        { timeoutMs: env.jobTimeoutMs, cwd: jobDir(jobId) }
      );
      if (res.exitCode !== 0) throw mapYtDlpFailure(res.stderr, res.exitCode);

      const stat = await fs.stat(out).catch(() => null);
      if (!stat || stat.size === 0) throw new AppError("PROCESSING_FAILED", "Empty output");
      if (stat.size > env.maxFileSizeBytes) {
        await fs.rm(out, { force: true }).catch(() => undefined);
        throw new AppError("FILE_TOO_LARGE");
      }
      log(jobId, "download completed", { bytes: stat.size });

      // Metadata already fetched in parallel above; just collect it.
      const meta = await metaPromise;

      const expiresAt = new Date(Date.now() + env.fileTtlMs).toISOString();
      return {
        jobId,
        title: meta?.title,
        thumbnail: meta?.thumbnail,
        duration: meta?.duration,
        format: audioOnly ? "MP3" : "MP4",
        container: audioOnly ? "mp3" : "mp4",
        resolution: undefined,
        filesize: stat.size,
        fileId: jobId,
        downloadUrl: `/api/files/${jobId}`,
        expiresAt,
      };
    } catch (err) {
      await fs.rm(out, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}

export async function cleanupJobDir(jobId: string): Promise<void> {
  try {
    await fs.rm(jobDir(jobId), { recursive: true, force: true });
  } catch {
    // cleanup must never throw
  }
}
