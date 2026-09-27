import type { DownloadErrorCode } from "@/types/downloader";

export type ApiErrorCode =
  | DownloadErrorCode
  | "VIDEO_UNAVAILABLE"
  | "PRIVATE_CONTENT"
  | "GEO_RESTRICTED"
  | "FILE_TOO_LARGE"
  | "TIMEOUT"
  | "YT_DLP_UNAVAILABLE"
  | "FFMPEG_UNAVAILABLE"
  | "BAD_REQUEST"
  | "REQUEST_TOO_LARGE"
  | "PLAN_LIMIT_REACHED";

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_URL: 422,
  BAD_REQUEST: 400,
  REQUEST_TOO_LARGE: 413,
  PLAN_LIMIT_REACHED: 429,
  VIDEO_UNAVAILABLE: 404,
  PRIVATE_CONTENT: 403,
  GEO_RESTRICTED: 451,
  PROCESSING_FAILED: 502,
  TIMEOUT: 504,
  FILE_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  TEMPORARILY_UNAVAILABLE: 503,
  YT_DLP_UNAVAILABLE: 503,
  FFMPEG_UNAVAILABLE: 503,
};

const USER_MESSAGE: Record<ApiErrorCode, string> = {
  INVALID_URL: "Please enter a valid TikTok URL.",
  UNSUPPORTED_URL: "This link isn't supported yet. Only public TikTok links work.",
  BAD_REQUEST: "Invalid request. Check the URL and try again.",
  REQUEST_TOO_LARGE: "Request is too large.",
  PLAN_LIMIT_REACHED: "You've reached your current download limit.",
  VIDEO_UNAVAILABLE: "This video is unavailable. It may have been deleted.",
  PRIVATE_CONTENT: "This content appears to be private.",
  GEO_RESTRICTED: "This content isn't available in your region.",
  PROCESSING_FAILED: "The media could not be processed. Please try again.",
  TIMEOUT: "Processing took too long. Please try again.",
  FILE_TOO_LARGE: "The resulting file is too large to process.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  TEMPORARILY_UNAVAILABLE: "Our service is busy. Please try again shortly.",
  YT_DLP_UNAVAILABLE: "Downloader is temporarily unavailable. Please try again later.",
  FFMPEG_UNAVAILABLE: "Video conversion is temporarily unavailable.",
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly userMessage: string;

  constructor(code: ApiErrorCode, detail?: string) {
    super(detail ?? USER_MESSAGE[code]);
    this.code = code;
    this.status = STATUS[code];
    this.userMessage = USER_MESSAGE[code];
  }
}

export function userMessageFor(code: ApiErrorCode): string {
  return USER_MESSAGE[code];
}

export function statusFor(code: ApiErrorCode): number {
  return STATUS[code];
}
