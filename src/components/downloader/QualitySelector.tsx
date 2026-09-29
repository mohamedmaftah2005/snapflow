"use client";

import { useEffect, useState } from "react";
import type { MediaFormat } from "@/lib/media/formats";

export interface QualityChoice {
  kind: "auto" | "video" | "audio";
  maxHeight?: number;
  label: string;
}

/**
 * Quality selector showing only formats the source actually provides
 * (fetched from the server, debounced). Falls back to Auto + Audio when
 * inspection fails — never invents 1080p the source lacks, and never
 * offers 4K: TikTok publishes no 4K streams, so a 4K button could only
 * relabel upscaled 1080p.
 */
export default function QualitySelector({
  url,
  value,
  onChange,
}: {
  url: string;
  value: QualityChoice;
  onChange: (v: QualityChoice) => void;
}) {
  const [formats, setFormats] = useState<MediaFormat[] | null>(null);

  useEffect(() => {
    const trimmed = url.trim();
    let live = true;
    const t = window.setTimeout(() => {
      if (!/^https?:\/\/.+\..+/.test(trimmed)) {
        if (live) setFormats(null);
        return;
      }
      fetch("/api/download/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
        .then(async (r) => {
          if (!r.ok || !live) return;
          const b = (await r.json()) as { data?: { formats?: MediaFormat[] } };
          if (live) setFormats(b.data?.formats ?? []);
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [url]);

  const videos = (formats ?? []).filter((f) => f.type === "VIDEO");
  const hasAudio = (formats ?? []).some((f) => f.type === "AUDIO");
  const showHeights = videos.length > 0;
  const currentKey =
    value.kind === "auto" ? "auto" : value.kind === "audio" ? "audio" : `h${value.maxHeight}`;

  function pick(key: string): void {
    if (key === "auto") onChange({ kind: "auto", label: "Best available" });
    else if (key === "audio") onChange({ kind: "audio", label: "Audio only (MP3)" });
    else onChange({ kind: "video", maxHeight: Number(key.slice(1)), label: `Up to ${heightLabel(Number(key.slice(1)))}` });
  }

  return (
    <div>
      <span id="quality-label" className="mb-1 block text-sm font-semibold">
        Quality
      </span>
      <div role="radiogroup" aria-labelledby="quality-label" className="flex flex-wrap gap-2">
        <QualityRadio group="q" current={currentKey} k="auto" label="Best available" onPick={pick} />
        {showHeights
          ? videos.map((v) => (
              <QualityRadio key={v.id} group="q" current={currentKey} k={`h${v.height}`} label={heightLabel(v.height ?? 0)} onPick={pick} />
            ))
          : null}
        {(hasAudio || formats === null) && (
          <QualityRadio group="q" current={currentKey} k="audio" label="Audio MP3" onPick={pick} />
        )}
      </div>
      {formats !== null && videos.length === 0 && !hasAudio ? (
        <p className="mt-1 text-xs text-(--color-muted)">Quality inspection found no options — Auto will pick the best available.</p>
      ) : null}
      {videos.some((v) => (v.height ?? 0) >= 1080) ? (
        <p className="mt-1 text-xs text-(--color-muted)">Highest available is 1080p Full HD — TikTok publishes no 4K streams.</p>
      ) : null}
    </div>
  );
}

/** Friendly names for the heights TikTok actually serves. */
function heightLabel(height: number): string {
  if (height >= 1080) return "1080p Full HD";
  if (height >= 720) return "720p HD";
  return `${height}p`;
}

function QualityRadio({
  group, current, k, label, onPick,
}: {
  group: string; current: string; k: string; label: string; onPick: (k: string) => void;
}) {
  return (
    <label
      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        current === k
          ? "border-(--color-accent-600) bg-(--color-accent-50) text-(--color-accent-600)"
          : "border-(--color-border) bg-(--color-surface) text-(--color-ink-700) hover:border-(--color-accent-600)"
      }`}
    >
      <input type="radio" name={group} value={k} checked={current === k}
        onChange={() => onPick(k)} className="sr-only" />
      {label}
    </label>
  );
}
