"use client";

import type { DownloadOption as DownloadOptionType } from "@/types/downloader";

export default function DownloadOption({ option }: { option: DownloadOptionType }) {
  const isDemo = option.url.startsWith("#");
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-(--color-accent-50)/70 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-(--color-ink-950)">{option.label}</p>
        <p className="mt-0.5 text-xs text-(--color-muted)">
          {option.format} · {option.container.toUpperCase()}
          {option.resolution ? ` · ${option.resolution}` : ""}
        </p>
      </div>
      {isDemo ? (
        <span className="shrink-0 rounded-full bg-(--color-surface) px-4 py-2 text-sm font-semibold text-(--color-ink-700) border border-(--color-border)">
          Demo
        </span>
      ) : (
        <a
          href={option.url}
          download
          className="shrink-0 rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-semibold text-(--color-paper) hover:opacity-90"
        >
          Download
        </a>
      )}
    </div>
  );
}
