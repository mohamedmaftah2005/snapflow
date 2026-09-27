"use client";

import type { DownloadStatus } from "@/types/downloader";

const STEPS: { key: DownloadStatus; label: string }[] = [
  { key: "validating", label: "Validating link" },
  { key: "queued", label: "Your download is queued" },
  { key: "processing", label: "Processing your video" },
];

function stepState(current: DownloadStatus, step: DownloadStatus): "done" | "active" | "todo" {
  const order: DownloadStatus[] = ["validating", "queued", "processing", "completed"];
  return order.indexOf(step) < order.indexOf(current)
    ? "done"
    : step === current
      ? "active"
      : "todo";
}

export default function ProcessingState({ status }: { status: DownloadStatus }) {
  const active = status === "validating" || status === "queued" || status === "processing";
  if (!active) return null;
  return (
    <div aria-live="polite" className="anim-fade-up rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
      <ol className="space-y-3">
        {STEPS.map((step) => {
          const state = stepState(status, step.key);
          return (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                  state === "done"
                    ? "bg-emerald-100 text-emerald-700 dark:text-emerald-300"
                    : state === "active"
                      ? "bg-(--color-accent-50) text-(--color-accent-600)"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                }`}
              >
                {state === "done" ? "✓" : state === "active" ? "●" : "○"}
              </span>
              <span
                className={
                  state === "todo" ? "text-slate-400 dark:text-slate-500" : "font-medium text-(--color-ink-900)"
                }
              >
                {step.label}
                {state === "active" ? <span className="anim-pulse-soft">…</span> : state === "done" ? " ✓" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-(--color-muted)">Almost ready… — reflecting the live job state, no fake percentages.</p>
    </div>
  );
}
