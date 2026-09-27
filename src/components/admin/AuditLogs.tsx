"use client";

import { useState } from "react";
import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface Entry {
  id: string; actorUserId: string | null; actorRole: string; action: string;
  targetType?: string; targetId?: string; reason?: string;
  metadata?: Record<string, unknown>; requestId?: string; createdAt: number;
}

export default function AuditLogs() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (action) params.set("action", action);
  const { data, error, loading } = useAdminApi<{ entries: Entry[]; total: number }>(`/api/admin/audit-logs?${params}`);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Audit logs</h1>
      <p className="mt-1 text-sm text-(--color-muted)">Append-only. No edit or delete interface exists.</p>
      <div className="mt-3">
        <input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
          placeholder="Filter by action, e.g. USER_SUSPENDED"
          className="h-10 w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) px-3 text-sm" />
      </div>
      {loading ? <p className="mt-4 text-sm">Loading…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-(--color-error-600)">{error}</p> : null}
      {data && data.entries.length === 0 ? <div className="mt-4"><Empty text="No audit events." /></div> : null}
      {data && data.entries.length > 0 ? (
        <div>
          <ul className="mt-3 space-y-2">
            {data.entries.map((e) => (
              <li key={e.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Badge value={e.action} />
                  <span className="text-xs text-(--color-muted)">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-(--color-muted)">
                  actor: <span className="font-mono">{e.actorUserId ?? "system"}</span> ({e.actorRole})
                  {e.targetId ? <> · target: <span className="font-mono">{e.targetId}</span></> : null}
                  {e.reason ? <> · reason: {e.reason}</> : null}
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
      ) : null}
    </div>
  );
}
