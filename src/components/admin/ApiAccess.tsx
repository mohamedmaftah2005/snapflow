"use client";

import { useState } from "react";
import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface KeyRow {
  id: string; userId: string; name: string; prefix: string; scopes: string[];
  lastUsedAt?: number; expiresAt?: number; revokedAt?: number; createdAt: number;
}

export default function AdminApi() {
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, error, loading, reload } = useAdminApi<{ keys: KeyRow[] }>(
    query ? `/api/admin/api?userId=${encodeURIComponent(query)}` : null
  );

  async function revoke(key: KeyRow): Promise<void> {
    if (!window.confirm(`Revoke key "${key.name}" (${key.prefix}…)? It stops working immediately.`)) return;
    setMsg(null);
    const res = await fetch(`/api/admin/api/${key.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: key.userId }),
    });
    const b = (await res.json().catch(() => null)) as { success?: boolean; error?: { message: string } } | null;
    if (!b?.success) setMsg(b?.error?.message ?? "Revoke failed.");
    reload();
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">API access</h1>
      <p className="mt-1 text-sm text-(--color-muted)">Key metadata only — raw values were never stored and cannot be revealed.</p>
      <div className="mt-3 flex gap-2">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID…"
          className="h-10 flex-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 text-sm" />
        <button type="button" onClick={() => setQuery(userId.trim())}
          className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper)">
          Lookup
        </button>
      </div>
      {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
      {loading ? <p className="mt-4 text-sm">Loading…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-(--color-error-600)">{error}</p> : null}
      {data && data.keys.length === 0 ? <div className="mt-4"><Empty text="No keys for this user." /></div> : null}
      {data && data.keys.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {data.keys.map((k) => (
            <li key={k.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{k.name} <span className="font-mono font-normal text-(--color-muted)">{k.prefix}…</span></p>
                  <p className="text-xs text-(--color-muted)">{k.scopes.join(", ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge value={k.revokedAt ? "REVOKED" : "ACTIVE"} />
                  {!k.revokedAt ? (
                    <button type="button" onClick={() => void revoke(k)}
                      className="rounded-full border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-(--color-error-600)">
                      Revoke
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
