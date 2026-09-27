"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";

interface HistJob {
  id: string;
  provider: string;
  mediaType: string;
  title: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  saved: boolean;
  url: string;
}

const STATUSES = ["", "PENDING", "QUEUED", "PROCESSING", "UPLOADING", "COMPLETED", "FAILED", "EXPIRED", "CANCELED"];
const PROVIDERS = ["", "tiktok", "youtube", "instagram"];

export default function History() {
  const [jobs, setJobs] = useState<HistJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (status) params.set("status", status);
    if (provider) params.set("provider", provider);
    fetch(`/api/downloads?${params}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?expired=1");
          return;
        }
        const body = (await res.json()) as {
          success: boolean;
          data?: { jobs: HistJob[]; total: number };
          error?: { message: string };
        };
        if (!live) return;
        if (!body.success || !body.data) {
          setError(body.error?.message ?? "Could not load history.");
          return;
        }
        setJobs(body.data.jobs);
        setTotal(body.data.total);
        track("history_viewed", {});
      })
      .catch(() => {
        if (live) setError("Network error.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, status, provider, router]);

  async function remove(id: string): Promise<void> {
    if (!window.confirm("Delete this history entry? Any live files go with it.")) return;
    setActionError(null);
    const res = await fetch(`/api/downloads/${id}`, { method: "DELETE" });
    if (res.ok) {
      track("download_deleted", {});
      setJobs((j) => j.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      setActionError("Could not delete that entry. Please try again.");
    }
  }

  async function toggleSave(job: HistJob): Promise<void> {
    setActionError(null);
    const res = await fetch(`/api/downloads/${job.id}/save`, { method: job.saved ? "DELETE" : "POST" });
    if (res.ok) setJobs((js) => js.map((x) => (x.id === job.id ? { ...x, saved: !x.saved } : x)));
    else setActionError("Could not update the bookmark. Please try again.");
  }

  async function downloadAgain(job: HistJob): Promise<void> {
    track("download_again", { provider: job.provider });
    setActionError(null);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: job.url }),
      });
      const body = (await res.json()) as { success: boolean; data?: { jobId: string }; error?: { message: string } };
      if (body.success && body.data) router.push(`/dashboard/downloads/${body.data.jobId}`);
      else setActionError(body.error?.message ?? "Could not restart that download.");
    } catch {
      setActionError("Network error. Please try again.");
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">History</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-xl border border-(--color-border) bg-(--color-surface) px-2 text-sm" aria-label="Status filter">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === "" ? "All statuses" : s}</option>
          ))}
        </select>
        <select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}
          className="h-10 rounded-xl border border-(--color-border) bg-(--color-surface) px-2 text-sm" aria-label="Provider filter">
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p === "" ? "All providers" : p}</option>
          ))}
        </select>
      </div>
      {loading ? <p className="mt-4 text-sm">Loading…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-(--color-error-600)">{error}</p> : null}
      {actionError ? <p role="alert" className="mt-4 text-sm text-(--color-error-600)">{actionError}</p> : null}
      {!loading && jobs.length === 0 ? <p className="mt-4 text-sm text-(--color-ink-700)">No downloads yet.</p> : null}
      <ul className="mt-4 space-y-2">
        {jobs.map((j) => (
          <li key={j.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dashboard/downloads/${j.id}`} className="truncate text-sm font-bold hover:underline">
                  {j.title}
                </Link>
                <p className="text-xs text-(--color-muted)">
                  {j.provider} · {j.mediaType} · {j.status.toLowerCase()} · {new Date(j.createdAt).toLocaleDateString()}
                  {j.expired ? " · file expired" : ` · available until ${new Date(j.expiresAt).toLocaleDateString()}`}
                  {j.saved ? " · saved" : ""}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/dashboard/downloads/${j.id}`}
                className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                Details
              </Link>
              <button type="button" onClick={() => void downloadAgain(j)}
                className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                Download again
              </button>
              <button type="button" onClick={() => void toggleSave(j)}
                className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                {j.saved ? "Unsave" : "Save"}
              </button>
              <button type="button" onClick={() => void remove(j.id)}
                className="rounded-full border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-(--color-error-600)">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-3 text-sm">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
          className="rounded-full border border-(--color-border) px-3 py-1 disabled:opacity-40">← Prev</button>
        <span className="text-(--color-muted)">Page {page} · {total} total</span>
        <button type="button" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}
          className="rounded-full border border-(--color-border) px-3 py-1 disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}
