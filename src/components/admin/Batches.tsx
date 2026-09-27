"use client";

import { useState } from "react";
import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface Row {
  id: string; status: string; total: number; completed: number; failed: number;
  processing: number; canceled: number; userId: string | null; createdAt: number;
}

export default function Batches() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAdminApi<{ batches: Row[]; total: number }>(
    `/api/admin/batches?page=${page}&limit=20`
  );

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Unavailable."}</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Batches</h1>
      {data.batches.length === 0 ? <div className="mt-4"><Empty text="No batches yet." /></div> : (
        <div>
          <ul className="mt-3 space-y-2">
            {data.batches.map((b) => (
              <li key={b.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-mono text-xs">{b.id}</p>
                  <Badge value={b.status} />
                </div>
                <p className="mt-1 text-xs text-(--color-muted)">
                  {b.completed}/{b.total} completed · {b.failed} failed · {b.processing} processing
                  {b.userId ? ` · user ${b.userId.slice(0, 12)}…` : " · guest"}
                </p>
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
      )}
    </div>
  );
}
