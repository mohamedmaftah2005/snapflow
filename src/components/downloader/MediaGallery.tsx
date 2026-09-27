"use client";

import { useState } from "react";
import type { DownloadOption } from "@/types/downloader";
import DownloadOptionRow from "./DownloadOption";

/** Caps for client-side "download all" (no server ZIP is ever built). */
export const DOWNLOAD_ALL_MAX_ITEMS = 10;
export const DOWNLOAD_ALL_MAX_BYTES = 500 * 1024 * 1024;

export function downloadAllAllowed(items: DownloadOption[]): boolean {
  if (items.length < 2 || items.length > DOWNLOAD_ALL_MAX_ITEMS) return false;
  let total = 0;
  for (const it of items) {
    if (!it.url || it.url.startsWith("#")) return false;
    total += it.filesize ?? 0;
  }
  return total <= DOWNLOAD_ALL_MAX_BYTES;
}

/**
 * Generic multi-item gallery: pager + thumbnails + per-item actions.
 * Used for any CAROUSEL/slideshow result, regardless of provider.
 */
export default function MediaGallery({ items }: { items: DownloadOption[] }) {
  const [index, setIndex] = useState(0);
  const current = items[Math.min(index, items.length - 1)];
  if (!current) return null;

  async function downloadAll(): Promise<void> {
    // Sequential browser downloads with a small gap (no server-side ZIP).
    for (const it of items) {
      const a = document.createElement("a");
      a.href = it.url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-(--color-border) p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-(--color-ink-950)">
          {items.length} items
        </p>
        <div className="flex items-center gap-2" role="group" aria-label="Browse items">
          <button
            type="button"
            aria-label="Previous item"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="grid size-9 place-items-center rounded-full border border-(--color-border) text-lg disabled:opacity-40"
          >
            ‹
          </button>
          <p aria-live="polite" className="min-w-12 text-center text-sm font-semibold">
            {index + 1} / {items.length}
          </p>
          <button
            type="button"
            aria-label="Next item"
            disabled={index >= items.length - 1}
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            className="grid size-9 place-items-center rounded-full border border-(--color-border) text-lg disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
      <div className="mt-3">
        <DownloadOptionRow option={current} />
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="All items">
        {items.map((it, i) => (
          <button
            key={it.id}
            role="listitem"
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Go to item ${i + 1}`}
            aria-current={i === index}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              i === index
                ? "border-(--color-accent-600) bg-(--color-accent-50) text-(--color-accent-600)"
                : "border-(--color-border) text-(--color-ink-700)"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {downloadAllAllowed(items) ? (
        <button
          type="button"
          onClick={downloadAll}
          className="mt-3 w-full rounded-xl bg-(--color-ink-950) py-2.5 text-sm font-bold text-(--color-paper) hover:opacity-90"
        >
          Download all ({items.length})
        </button>
      ) : null}
    </div>
  );
}
