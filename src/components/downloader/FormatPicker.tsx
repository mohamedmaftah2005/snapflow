"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaFormat } from "@/lib/media/formats";

export type PickedFormat =
  | { kind: "auto" }
  | { kind: "video"; maxHeight: number }
  | { kind: "audio" };

interface VideoMeta {
  title?: string;
  duration?: number;
  thumbnail?: string;
  author?: string;
}

interface InspectData {
  provider: string;
  formats: MediaFormat[];
  meta: VideoMeta;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `~${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
  return `~${Math.round(bytes / 1024)} KB`;
}

function formatClock(totalSeconds?: number): string {
  if (totalSeconds === undefined || totalSeconds < 0) return "";
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function providerName(id: string): string {
  return id.length > 0 ? id.charAt(0).toUpperCase() + id.slice(1) : "Video";
}

/**
 * Paste-preview: title + provider/duration/account + a download table with
 * real sizes (best first, then heights, then audio-only). Picking a row
 * starts a download job in that format; the big Download button stays
 * best-quality automatic. Nothing renders until inspection succeeds, so a
 * failed lookup never blocks downloading.
 *
 * Yoinks beats: inspection is cancellable (button or Escape) and the table
 * is keyboard-navigable (↑↓ to move, Enter to download).
 */
export default function FormatPicker({
  url,
  disabled,
  onPick,
}: {
  url: string;
  disabled?: boolean;
  onPick: (format: PickedFormat) => void;
}) {
  const [found, setFound] = useState<{ url: string; data: InspectData } | null>(null);
  const [checkingUrl, setCheckingUrl] = useState<string | null>(null);
  const [nav, setNav] = useState<{ url: string; idx: number }>({ url: "", idx: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // State updates happen only in async callbacks (never synchronously in
  // the effect body). Stale results are hidden by derivation below, so no
  // eager reset — and no cascading renders.
  useEffect(() => {
    const trimmed = url.trim();
    let live = true;
    if (!/^https?:\/\/.+\..+/.test(trimmed)) return undefined;
    const t = window.setTimeout(() => {
      if (!live) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setCheckingUrl(trimmed);
      fetch("/api/download/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: ctrl.signal,
      })
        .then(async (r) => {
          if (!live) return;
          if (!r.ok) return;
          const b = (await r.json()) as { data?: InspectData };
          if (b.data) setFound({ url: trimmed, data: b.data });
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) setCheckingUrl((cur) => (cur === trimmed ? null : cur));
        });
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(t);
      ctrlAbort();
    };
  }, [url]);

  function ctrlAbort(): void {
    try {
      abortRef.current?.abort();
    } catch {
      // ignore
    }
  }

  // Escape cancels an in-flight inspection (yoinks: esc cancel).
  useEffect(() => {
    if (checkingUrl === null) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") ctrlAbort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkingUrl]);

  const trimmed = url.trim();
  const data = found && found.url === trimmed ? found.data : null;
  const checking = checkingUrl !== null && checkingUrl === trimmed;

  if (!data) {
    return checking ? (
      <p role="status" className="mt-3 flex items-center justify-center gap-3 text-xs text-(--color-muted)">
        Inspecting link…
        <button
          type="button"
          onClick={ctrlAbort}
          className="rounded-full border border-(--color-border) px-3 py-1 font-semibold text-(--color-ink-700) hover:bg-(--color-accent-50)"
        >
          Cancel (esc)
        </button>
      </p>
    ) : null;
  }

  const videos = data.formats
    .filter((f) => f.type === "VIDEO")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const audio = data.formats.find((f) => f.type === "AUDIO");
  const top = videos[0];
  const metaBits = [providerName(data.provider), formatClock(data.meta.duration), data.meta.author].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );

  interface Row {
    key: string;
    label: string;
    detail: string;
    pick: PickedFormat;
  }
  const rows: Row[] = [
    {
      key: "auto",
      label: "Best available",
      detail: [top ? `${top.height}p` : null, "mp4", formatBytes(top?.filesize)].filter(Boolean).join(" · "),
      pick: { kind: "auto" },
    },
    ...videos.map((v) => ({
      key: v.id,
      label: `${v.height}p`,
      detail: [v.extension.toUpperCase(), formatBytes(v.filesize)].filter(Boolean).join(" · "),
      pick: { kind: "video", maxHeight: v.height ?? 720 } as PickedFormat,
    })),
    ...(audio
      ? [
          {
            key: "audio",
            label: "♪ audio only",
            detail: ["mp3", formatBytes(audio.filesize)].filter(Boolean).join(" · "),
            pick: { kind: "audio" } as PickedFormat,
          },
        ]
      : []),
  ];
  const activeIdx = nav.url === trimmed ? Math.min(nav.idx, rows.length - 1) : 0;

  function moveFocus(next: number): void {
    const idx = (next + rows.length) % rows.length;
    setNav({ url: trimmed, idx });
    btnRefs.current[idx]?.focus();
  }

  function onTableKey(e: React.KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(activeIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(activeIdx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(rows.length - 1);
    }
    // Enter/Space on a focused row fires the native button click → download.
  }

  return (
    <section aria-live="polite" className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="truncate text-sm font-bold text-(--color-ink-950)">
        {data.meta.title ?? "Untitled video"}
      </h2>
      {metaBits.length > 0 ? (
        <p className="mt-0.5 truncate text-xs text-(--color-muted)">{metaBits.join(" · ")}</p>
      ) : null}
      <p className="mt-3 mb-1 text-xs font-bold tracking-widest text-(--color-muted) uppercase">
        Download
      </p>
      <ul className="space-y-1" onKeyDown={onTableKey} aria-label="Download options. Arrow keys to move, Enter to download.">
        {rows.map((row, i) => (
          <li key={row.key}>
            <RowButton
              label={row.label}
              detail={row.detail}
              disabled={disabled}
              primary={i === 0}
              current={i === activeIdx}
              buttonRef={(el) => {
                btnRefs.current[i] = el;
              }}
              onPick={() => onPick(row.pick)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RowButton({
  label,
  detail,
  onPick,
  disabled,
  primary,
  current,
  buttonRef,
}: {
  label: string;
  detail: string;
  onPick: () => void;
  disabled?: boolean;
  primary?: boolean;
  current?: boolean;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      disabled={disabled}
      onClick={onPick}
      aria-label={detail ? `Download ${label} (${detail})` : `Download ${label}`}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-(--color-accent-600) ${
        primary
          ? "border border-(--color-accent-600) bg-(--color-accent-50) font-bold text-(--color-ink-950) hover:opacity-90"
          : "text-(--color-ink-700) hover:bg-(--color-accent-50)"
      }`}
    >
      <span aria-hidden="true" className="text-(--color-accent-600)">{current ? "❯" : "▷"}</span>
      <span className="font-semibold">{label}</span>
      {detail ? <span className="text-(--color-muted)">· {detail}</span> : null}
    </button>
  );
}
