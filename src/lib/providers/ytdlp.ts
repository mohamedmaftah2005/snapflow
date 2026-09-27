import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { mapYtDlpFailure, runBinary } from "@/services/downloader/ytdlp";

export interface RawMetadata {
  sourceId: string;
  title?: string;
  description?: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
}

interface YtDlpJson {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  uploader?: unknown;
  channel?: unknown;
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

/** Shared yt-dlp JSON metadata fetch + normalization (provider-agnostic). */
export async function fetchYtDlpMetadata(normalizedUrl: string, jobTag: string): Promise<RawMetadata> {
  const j = await fetchRawMetadata(normalizedUrl, jobTag);
  return normalizeRawMetadata(j, normalizedUrl);
}

/** Raw parsed dump JSON (includes formats[]). Throws normalized AppErrors. */
export async function fetchRawMetadata(normalizedUrl: string, jobTag: string): Promise<YtDlpJson & { formats?: unknown }> {
  const res = await runBinary(
    env.ytDlpPath,
    ["--dump-single-json", "--no-playlist", "--no-warnings", "--socket-timeout", "15", normalizedUrl],
    { timeoutMs: Math.min(env.jobTimeoutMs, 60_000) }
  );
  if (res.exitCode !== 0) throw mapYtDlpFailure(res.stderr, res.exitCode);
  try {
    return JSON.parse(res.stdout) as YtDlpJson & { formats?: unknown };
  } catch {
    throw new AppError("PROCESSING_FAILED", `Could not parse metadata (${jobTag})`);
  }
}

function normalizeRawMetadata(j: YtDlpJson, normalizedUrl: string): RawMetadata {
  return {
    sourceId: typeof j.id === "string" ? j.id : normalizedUrl,
    title: typeof j.title === "string" ? j.title.slice(0, 300) : undefined,
    description: typeof j.description === "string" ? j.description.slice(0, 2000) : undefined,
    author:
      typeof j.uploader === "string"
        ? j.uploader.slice(0, 200)
        : typeof j.channel === "string"
          ? j.channel.slice(0, 200)
          : undefined,
    duration: typeof j.duration === "number" && Number.isFinite(j.duration) ? Math.round(j.duration) : undefined,
    thumbnail: pickThumbnail(j),
  };
}
