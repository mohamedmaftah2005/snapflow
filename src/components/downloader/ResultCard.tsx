"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import type { MediaResult } from "@/types/downloader";
import DownloadOption from "./DownloadOption";

// Only rendered for multi-file results (post-processing UI).
const MediaGallery = dynamic(() => import("./MediaGallery"));

function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds && totalSeconds !== 0) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ResultCard({
  result,
  sourceUrl,
  onReset,
}: {
  result: MediaResult;
  sourceUrl: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const firstUrl = result.downloads[0]?.url;
  const multi = result.downloads.length > 1;
  const providerLabel = result.provider
    ? result.provider.charAt(0).toUpperCase() + result.provider.slice(1)
    : null;

  async function copyLink(): Promise<void> {
    if (!firstUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(firstUrl, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section aria-live="polite" className="anim-fade-up overflow-hidden rounded-3xl border border-(--color-border) bg-(--color-surface) shadow-(--shadow-card)">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <div
          aria-hidden="true"
          className="grid h-44 w-full shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#101828] via-[#1d2939] to-[#4f46e5] text-white sm:h-auto sm:w-44"
        >
          <div className="text-center">
            <p className="text-3xl">▶</p>
            <p className="mt-1 text-xs font-semibold tracking-wide opacity-80">{formatDuration(result.duration)}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-widest text-(--color-accent-600) uppercase">
            Ready to save{providerLabel ? ` · ${providerLabel}` : ""}{result.isMock ? " · demo data" : ""}
          </p>
          <h2 className="mt-1 truncate text-lg font-bold text-(--color-ink-950)">{result.title}</h2>
          <p className="mt-1 break-all text-xs text-(--color-muted)">{sourceUrl}</p>
          {multi ? (
            <MediaGallery items={result.downloads} />
          ) : (
            <div className="mt-4 space-y-2">
              {result.downloads.map((d) => (
                <DownloadOption key={d.id} option={d} />
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onReset}
              className="text-sm font-semibold text-(--color-accent-600) hover:underline"
            >
              Download another →
            </button>
            {firstUrl ? (
              <button
                type="button"
                onClick={copyLink}
                className="text-sm font-semibold text-(--color-ink-700) hover:underline"
              >
                {copied ? "Link copied ✓" : "Copy link"}
              </button>
            ) : null}
            <Link
              href="/contact"
              className="text-sm font-medium text-(--color-muted) hover:underline"
            >
              Report a problem
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
