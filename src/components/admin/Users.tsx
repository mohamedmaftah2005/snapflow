"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface Row {
  id: string; email: string; name?: string; status: string; role: string;
  plan: string; emailVerified: boolean; createdAt: number;
}

export default function Users() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  const { data, error, loading } = useAdminApi<{ users: Row[]; total: number }>(`/api/admin/users?${params}`);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Users</h1>
      <div className="mt-3 flex gap-2">
        <input
          value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search email or ID…"
          className="h-10 flex-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 text-sm"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-xl border border-(--color-border) bg-(--color-surface) px-2 text-sm" aria-label="Status filter">
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>
      {loading ? <p className="mt-4 text-sm">Loading…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-(--color-error-600)">{error}</p> : null}
      {data && data.users.length === 0 ? <div className="mt-4"><Empty text="No users found." /></div> : null}
      {data && data.users.length > 0 ? (
        <div>
          <ul className="mt-3 space-y-2">
            {data.users.map((u) => (
              <li key={u.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/users/${u.id}`} className="truncate text-sm font-bold hover:underline">
                      {u.email}
                    </Link>
                    <p className="truncate font-mono text-xs text-(--color-muted)">{u.id}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge value={u.plan} />
                    <Badge value={u.status} />
                    <Badge value={u.role} />
                  </div>
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
