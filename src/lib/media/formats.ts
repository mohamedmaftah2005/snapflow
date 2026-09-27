export type MediaFormatType = "VIDEO" | "AUDIO";

export interface MediaFormat {
  id: string; // e.g. "h264-1080p" or "audio"
  type: MediaFormatType;
  extension: string;
  mimeType: string;
  height?: number;
  bitrate?: number;
  filesize?: number;
  codec?: string;
}

export type FormatRequest =
  | { kind: "auto" }
  | { kind: "video"; maxHeight: number }
  | { kind: "audio" };

/**
 * Bounds for requested heights. Values outside 144–2160 are rejected;
 * videoFormatSelector() additionally clamps to what TikTok serves
 * (≤1080), so the yt-dlp template stays fixed and injection-free.
 */
export const MIN_REQUEST_HEIGHT = 144;
export const MAX_REQUEST_HEIGHT = 2160;

/**
 * Strict parsing of client format input. Shape is allowlisted and the
 * height must be an integer in range — the value itself never reaches a
 * shell (videoFormatSelector interpolates only a clamped integer).
 */
export function parseFormatRequest(input: unknown): FormatRequest {
  if (!input || (typeof input === "object" && Object.keys(input).length === 0)) {
    return { kind: "auto" };
  }
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("invalid format");
  const r = input as Record<string, unknown>;
  if (r.kind === "auto") return { kind: "auto" };
  if (r.kind === "audio") return { kind: "audio" };
  if (r.kind === "video") {
    const h = r.maxHeight;
    if (typeof h === "number" && Number.isInteger(h) && h >= MIN_REQUEST_HEIGHT && h <= MAX_REQUEST_HEIGHT) {
      return { kind: "video", maxHeight: h };
    }
  }
  throw new Error("invalid format");
}

interface RawFormat {
  format_id?: unknown;
  ext?: unknown;
  vcodec?: unknown;
  acodec?: unknown;
  width?: unknown;
  height?: unknown;
  tbr?: unknown;
  filesize?: unknown;
  filesize_approx?: unknown;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Normalize raw yt-dlp `formats[]` into displayable options.
 * Video: mp4-capable entries grouped by short side (best filesize wins).
 * Short-side bucketing merges portrait and landscape variants of the same
 * quality (1080x1920 and 1920x1080 are both "1080p") so the UI never
 * renders duplicate buttons — and every emitted height is inside the
 * server's accepted range.
 * Audio: present only when a real audio-only stream exists.
 */
export function normalizeFormats(raw: unknown): MediaFormat[] {
  const list = (raw as { formats?: unknown })?.formats;
  if (!Array.isArray(list)) return [];
  const byBucket = new Map<number, MediaFormat>();
  let audio: MediaFormat | null = null;
  for (const f of list as RawFormat[]) {
    const ext = typeof f.ext === "string" ? f.ext.toLowerCase() : "";
    const vcodec = typeof f.vcodec === "string" ? f.vcodec : "none";
    const acodec = typeof f.acodec === "string" ? f.acodec : "none";
    const height = num(f.height);
    const width = num(f.width);
    const filesize = num(f.filesize) ?? num(f.filesize_approx);
    if (vcodec !== "none" && height && (ext === "mp4" || ext === "webm")) {
      // Portrait streams report height as the long side (e.g. 1920 for a
      // 1080x1920 video); the short side identifies the quality tier.
      const bucket = width && width > 0 ? Math.min(width, height) : height;
      const cur = byBucket.get(bucket);
      if (!cur || (filesize ?? 0) > (cur.filesize ?? 0)) {
        byBucket.set(bucket, {
          id: `video-${bucket}p`,
          type: "VIDEO",
          extension: "mp4",
          mimeType: "video/mp4",
          height: bucket,
          filesize,
        });
      }
    } else if (vcodec === "none" && acodec !== "none") {
      if (!audio || (filesize ?? 0) > (audio.filesize ?? 0)) {
        audio = {
          id: "audio",
          type: "AUDIO",
          extension: "mp3",
          mimeType: "audio/mpeg",
          bitrate: num(f.tbr) ? Math.round((num(f.tbr) as number) * 1000) : undefined,
          filesize,
          codec: acodec,
        };
      }
    }
  }
  const out = [...byBucket.values()].sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  if (audio) out.push(audio);
  return out;
}

/** Fixed yt-dlp format selector for a video request. No user input inside. */
export function videoFormatSelector(maxHeight: number): string {
  const h = Math.min(Math.max(Math.floor(maxHeight), 144), 1080);
  return `bv*[height<=${h}]+ba/b[height<=${h}]/b`;
}

/** Fixed args for audio extraction via FFmpeg. No user input inside. */
export function audioExtractArgs(): string[] {
  return ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
}
