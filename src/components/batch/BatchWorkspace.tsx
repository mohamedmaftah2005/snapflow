"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QualitySelector, { type QualityChoice } from "@/components/downloader/QualitySelector";
import { track } from "@/lib/analytics";

interface BatchState {
  batchId: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  processing: number;
  canceled: number;
  archiveUrl?: string;
}

const TERMINAL = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELED", "EXPIRED"]);

export default function BatchWorkspace() {
  const [text, setText] = useState("");
  const [quality, setQuality] = useState<QualityChoice>({ kind: "auto", label: "Best available" });
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [errors, setErrors] = useState<{ url: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling(): void {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  async function poll(batchId: string, delay: number): Promise<void> {
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/batch/${batchId}`);
        const body = (await res.json()) as { success: boolean; data?: BatchState };
        if (!body.success || !body.data) {
          setError("Could not load batch status.");
          return;
        }
        setBatch(body.data);
        if (TERMINAL.has(body.data.status)) {
          if (body.data.status === "COMPLETED") track("batch_completed", {});
          else if (body.data.status === "PARTIALLY_COMPLETED") track("batch_partial", {});
          else if (body.data.status === "FAILED") track("batch_failed", {});
          return;
        }
        void poll(batchId, Math.min(delay + 1000, 4000));
      } catch {
        void poll(batchId, Math.min(delay + 1000, 4000));
      }
    }, delay);
  }

  async function start(): Promise<void> {
    const urls = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (urls.length === 0) {
      setError("Paste at least one URL.");
      return;
    }
    setBusy(true);
    setError(null);
    setErrors([]);
    setBatch(null);
    stopPolling();
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          ...(quality.kind === "auto"
            ? {}
            : quality.kind === "audio"
              ? { format: { kind: "audio" } }
              : { format: { kind: "video", maxHeight: quality.maxHeight ?? 720 } }),
        }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data?: { batchId: string } & BatchState;
        error?: { message: string };
        itemErrors?: { url: string; message: string }[];
      };
      if (!body.success || !body.data) {
        setError(body.error?.message ?? "Could not start batch.");
        return;
      }
      track("batch_created", {});
      setBatch({ ...body.data, batchId: body.data.batchId });
      setErrors(body.itemErrors ?? []);
      void poll(body.data.batchId, 1000);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelBatch(): Promise<void> {
    if (!batch) return;
    await fetch(`/api/batch/${batch.batchId}/cancel`, { method: "POST" }).catch(() => undefined);
    stopPolling();
    setBatch({ ...batch, status: "CANCELED" });
  }

  async function retryFailed(): Promise<void> {
    if (!batch) return;
    await fetch(`/api/batch/${batch.batchId}/retry`, { method: "POST" }).catch(() => undefined);
    void poll(batch.batchId, 1000);
  }

  async function requestZip(): Promise<void> {
    if (!batch) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/batch/${batch.batchId}/archive`, { method: "POST" });
      const body = (await res.json()) as { success: boolean; error?: { message: string } };
      if (body.success) {
        track("zip_created", {});
        void poll(batch.batchId, 2000);
      } else setError(body.error?.message ?? "Could not start archive.");
    } catch {
      setError("Network error.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-(--color-border) bg-(--color-surface) p-4 shadow-(--shadow-card) sm:p-6">
        <label htmlFor="batch-urls" className="mb-2 block text-[13px] font-semibold tracking-wide text-(--color-ink-700) uppercase">
          Links (one per line)
        </label>
        <textarea
          id="batch-urls" rows={5} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"https://www.tiktok.com/@user/video/1\nhttps://www.tiktok.com/@user/video/2"}
          spellCheck={false}
          className="w-full rounded-2xl border border-(--color-border) bg-(--color-surface) p-3 text-[15px] focus:outline-none"
        />
        <div className="mt-3">
          <QualitySelector url={text.split("\n")[0] ?? ""} value={quality} onChange={setQuality} />
        </div>
        <button type="button" onClick={() => void start()} disabled={busy}
          className="mt-3 flex h-[52px] w-full items-center justify-center rounded-2xl bg-(--color-accent-600) text-[16px] font-bold text-(--color-paper) disabled:opacity-60">
          {busy ? "Starting…" : "Start batch"}
        </button>
        {error ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{error}</p> : null}
      </div>

      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm">
          <p className="font-bold">Skipped {errors.length} invalid link{errors.length > 1 ? "s" : ""}:</p>
          <ul className="mt-1 space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="break-all text-(--color-ink-700)">{e.url || "(empty)"} — {e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {batch ? (
        <section aria-live="polite" className="rounded-3xl border border-(--color-border) bg-(--color-surface) p-5">
          <div className="flex items-center justify-between">
            <p className="font-bold">Batch progress</p>
            <p className="text-sm font-semibold">{batch.completed} / {batch.total} completed</p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar"
            aria-valuenow={batch.completed} aria-valuemin={0} aria-valuemax={batch.total} aria-label="Batch progress">
            <div className="h-full bg-(--color-accent-600) transition-all"
              style={{ width: batch.total > 0 ? `${Math.round((batch.completed / batch.total) * 100)}%` : "0%" }} />
          </div>
          <p className="mt-2 text-sm text-(--color-muted)">
            {batch.processing} processing · {batch.failed} failed · {batch.canceled} canceled · status: {batch.status}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!TERMINAL.has(batch.status) ? (
              <button type="button" onClick={() => void cancelBatch()}
                className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold">
                Cancel batch
              </button>
            ) : null}
            {batch.failed > 0 && (batch.status === "PARTIALLY_COMPLETED" || batch.status === "FAILED") ? (
              <button type="button" onClick={() => void retryFailed()}
                className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold">
                Retry {batch.failed} failed
              </button>
            ) : null}
            {batch.completed > 1 && !batch.archiveUrl ? (
              <button type="button" onClick={() => void requestZip()} disabled={archiving}
                className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper) disabled:opacity-60">
                {archiving ? "Preparing…" : `Download all as ZIP (${batch.completed})`}
              </button>
            ) : null}
            {batch.archiveUrl ? (
              <a href={batch.archiveUrl} onClick={() => track("zip_downloaded", {})}
                className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper)">
                Download ZIP
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <p className="text-center text-xs text-(--color-muted)">
        Batches count against your daily limit. <Link className="underline" href="/dashboard/history">View history</Link>
      </p>
    </div>
  );
}
