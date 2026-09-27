"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

const STATUSES = ["", "QUEUED", "PROCESSING", "UPLOADING", "COMPLETED", "FAILED", "EXPIRED", "CANCELED"];

interface Row {
  id: string; provider: string; status: string; userId: string | null;
  title: string; createdAt: number; errorCode?: string;
}

export default function Jobs() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) params.set("status", status);
  const { data, error, loading } = useAdminApi<{ jobs: Row[]; total: number }>(`/api/admin/jobs?${params}`);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Jobs</h1>
      <div className="mt-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-xl border border-(--color-border) bg-(--color-surface) px-2 text-sm" aria-label="Status filter">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === "" ? "All statuses" : s}</option>
          ))}
        </select>
      </div>
      {loading ? <p className="mt-4 text-sm">Loading…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-(--color-error-600)">{error}</p> : null}
      {data && data.jobs.length === 0 ? <div className="mt-4"><Empty text="No jobs match." /></div> : null}
      {data && data.jobs.length > 0 ? (
        <div>
          <ul className="mt-3 space-y-2">
            {data.jobs.map((j) => (
              <li key={j.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/jobs/${j.id}`} className="truncate text-sm font-bold hover:underline">
                      {j.title}
                    </Link>
                    <p className="truncate font-mono text-xs text-(--color-muted)">
                      {j.id} · {j.provider}{j.errorCode ? ` · ${j.errorCode}` : ""}
                    </p>
                  </div>
                  <Badge value={j.status} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-(--color-border) px-3 py-1 disabled:opacity-40">← Prev</button>
            <span className="text-(--color-muted)">Page {page} · {data.total} total</span>
            <button type="button" disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-(--color-border) px-3 py-1 disabled:opacity-40">Next →</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
