"use client";

import Link from "next/link";
import type { DownloadErrorCode } from "@/types/downloader";

const MESSAGES: Record<DownloadErrorCode, { title: string; hint: string }> = {
  INVALID_URL: { title: "Invalid TikTok URL", hint: "Please check the link and try again." },
  UNSUPPORTED_URL: { title: "Unsupported link", hint: "This link isn't supported yet. Only public TikTok links work." },
  PROCESSING_FAILED: {
    title: "Processing failed",
    hint: "Something went wrong while processing this link. Please try again.",
  },
  RATE_LIMITED: { title: "Too many requests", hint: "Please wait a moment and try again." },
  TEMPORARILY_UNAVAILABLE: {
    title: "Temporarily unavailable",
    hint: "Our service is busy. Please try again shortly.",
  },
  PLAN_LIMIT_REACHED: {
    title: "Daily limit reached",
    hint: "You've reached your current download limit. It resets tomorrow.",
  },
};

export default function ErrorState({
  code,
  message,
  onRetry,
}: {
  code?: DownloadErrorCode;
  message?: string;
  onRetry?: () => void;
}) {
  const fallback = MESSAGES[code ?? "PROCESSING_FAILED"];
  const expired = /expired/i.test(message ?? "");
  const title = expired ? "This download has expired" : fallback.title;
  return (
    <div role="alert" className="anim-fade-up rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-5">
      <p className="font-semibold text-(--color-error-600)">{title}</p>
      <p className="mt-1 text-sm leading-6 text-red-900/80 dark:text-red-200">{message ?? fallback.hint}</p>
      {code === "PLAN_LIMIT_REACHED" ? (
        <Link
          href="/pricing"
          className="mt-3 inline-block rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-semibold text-(--color-paper)"
        >
          See plans
        </Link>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-red-200 dark:border-red-800 bg-(--color-surface) px-4 py-2 text-sm font-semibold text-(--color-error-600) hover:bg-red-100/60 dark:hover:bg-red-950/60"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
