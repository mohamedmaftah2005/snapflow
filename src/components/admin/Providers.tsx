"use client";

import { useState } from "react";
import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface Provider {
  id: string; name: string; status: string; capabilities: Record<string, boolean>;
  contentTypes: string[]; jobs7d: number; successRate: number | null; avgMs: number | null;
}

export default function Providers() {
  const { data, error, loading, reload } = useAdminApi<{ providers: Provider[] }>("/api/admin/providers");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(id: string, status: string): Promise<void> {
    const r = reason[id] ?? "";
    if (r.trim().length < 3) {
      setMsg("A reason (min 3 chars) is required for provider changes.");
      return;
    }
    if (!window.confirm(`${status} provider ${id}?`)) return;
    setBusy(`${id}:${status}`);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reason: r }),
      });
      const b = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!b.success) setMsg(b.error?.message ?? "Failed.");
      reload();
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Unavailable."}</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Providers</h1>
      {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
      {data.providers.length === 0 ? <div className="mt-4"><Empty text="No providers registered." /></div> : null}
      <ul className="mt-4 space-y-3">
        {data.providers.map((p) => (
          <li key={p.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-bold">{p.name}</p>
              <Badge value={p.status} />
            </div>
            <p className="mt-1 text-sm text-(--color-muted)">
              {p.jobs7d} jobs (7d)
              {p.successRate !== null ? ` · ${p.successRate}% success` : ""}
              {p.avgMs !== null ? ` · avg ${Math.round(p.avgMs / 100) / 10}s` : ""}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={reason[p.id] ?? ""} onChange={(e) => setReason((m) => ({ ...m, [p.id]: e.target.value }))}
                placeholder="Reason (required, audited)" aria-label={`Reason for ${p.name} change`}
                className="h-10 flex-1 rounded-lg border border-(--color-border) px-3 text-sm"
              />
              <div className="flex gap-2">
                {(["enabled", "maintenance", "disabled"] as const).map((s) => (
                  <button key={s} type="button" disabled={busy !== null} onClick={() => void setStatus(p.id, s)}
                    className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                    {busy === `${p.id}:${s}` ? "…" : s}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
