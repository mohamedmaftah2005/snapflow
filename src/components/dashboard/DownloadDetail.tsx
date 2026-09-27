"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface DetailMedia {
  title: string;
  provider?: string;
  mediaType?: string;
  duration?: number;
  downloads: { id: string; label: string; format: string; url: string; filesize?: number }[];
}

interface Detail {
  status: string;
  media?: DetailMedia;
}

export default function DownloadDetail({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    let delay = 1000;
    async function poll(): Promise<void> {
      try {
        const res = await fetch(`/api/download/${id}`);
        const body = (await res.json()) as {
          success: boolean;
          data?: { status: string; media?: DetailMedia; saved?: boolean };
          error?: { message: string };
        };
        if (!live) return;
        if (!body.success) {
          setError(body.error?.message ?? "Not found.");
          return;
        }
        if (typeof body.data?.saved === "boolean") setSaved(body.data.saved);
        setDetail({ status: body.data?.status ?? "UNKNOWN", media: body.data?.media });
        const terminal = ["COMPLETED", "FAILED", "EXPIRED", "CANCELED"];
        if (body.data && !terminal.includes(body.data.status)) {
          delay = Math.min(delay + 1000, 4000);
          window.setTimeout(() => void poll(), delay);
        }
      } catch {
        if (live) window.setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      live = false;
    };
  }, [id]);

  async function act(path: string, method = "POST"): Promise<void> {
    await fetch(path, { method }).catch(() => undefined);
    window.location.reload();
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p role="alert" className="text-sm text-(--color-error-600)">{error}</p>
        <Link className="mt-2 inline-block text-sm font-semibold text-(--color-accent-600) hover:underline" href="/dashboard/history">
          Back to history
        </Link>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <Link className="text-sm font-semibold text-(--color-accent-600) hover:underline" href="/dashboard/history">
        ← History
      </Link>
      <h1 className="mt-2 truncate text-2xl font-extrabold">{detail.media?.title ?? "Download"}</h1>
      <p className="mt-1 text-sm text-(--color-muted)">
        Status: {detail.status.toLowerCase()}
        {detail.media?.provider ? ` · ${detail.media.provider}` : ""}
        {detail.media?.mediaType ? ` · ${detail.media.mediaType}` : ""}
      </p>
      {detail.media?.downloads ? (
        <ul className="mt-4 space-y-2">
          {detail.media.downloads.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
              <span className="text-sm font-semibold">{d.label} · {d.format}</span>
              <a href={d.url} download className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper)">
                Download
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {detail.status !== "COMPLETED" && !["FAILED", "EXPIRED", "CANCELED"].includes(detail.status) ? (
          <button type="button" onClick={() => void act(`/api/download/${id}/cancel`)}
            className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
        ) : null}
        {detail.status === "FAILED" ? (
          <button type="button" onClick={() => void act(`/api/download/${id}/retry`)}
            className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold">
            Retry
          </button>
        ) : null}
        <button type="button"
          onClick={() => void fetch(`/api/downloads/${id}/save`, { method: saved ? "DELETE" : "POST" }).then(() => setSaved(!saved))}
          className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold">
          {saved ? "Unsave" : "Save"}
        </button>
        <button type="button"
          onClick={() => {
            if (window.confirm("Delete this download and its files?")) {
              void fetch(`/api/downloads/${id}`, { method: "DELETE" }).then(() => {
                router.push("/dashboard/history");
              });
            }
          }}
          className="rounded-full border border-red-200 dark:border-red-800 px-4 py-2 text-sm font-semibold text-(--color-error-600)">
          Delete
        </button>
      </div>
    </main>
  );
}
