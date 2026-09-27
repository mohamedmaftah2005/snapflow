"use client";

import { useState } from "react";
import { Badge, useAdminApi } from "@/components/admin/ui";

interface Flag {
  key: string; enabled: boolean; source: "db" | "env"; description: string;
}

export default function Flags() {
  const { data, error, loading, reload } = useAdminApi<{ flags: Flag[] }>("/api/admin/flags");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(f: Flag): Promise<void> {
    if (reason.trim().length < 3) {
      setMsg("A reason (min 3 chars) is required.");
      return;
    }
    if (!window.confirm(`${f.enabled ? "Disable" : "Enable"} ${f.key}?`)) return;
    setBusy(f.key);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: f.key, enabled: !f.enabled, reason }),
      });
      const b = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!b.success) setMsg(b.error?.message ?? "Failed.");
      setReason("");
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
      <h1 className="text-2xl font-extrabold">Feature flags</h1>
      <p className="mt-1 text-sm text-(--color-muted)">Database wins over env defaults. Changes are audited.</p>
      <div className="mt-3">
        <label htmlFor="flag-reason" className="block text-xs font-semibold">Reason for next change (required)</label>
        <input id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this changing?"
          className="mt-1 h-10 w-full max-w-md rounded-lg border border-(--color-border) bg-(--color-surface) px-3 text-sm" />
      </div>
      {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
      <ul className="mt-3 space-y-2">
        {data.flags.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold">{f.key}</p>
              <p className="truncate text-xs text-(--color-muted)">{f.description} · source: {f.source}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge value={f.enabled ? "enabled" : "disabled"} />
              <button type="button" disabled={busy !== null} onClick={() => void toggle(f)}
                className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                {busy === f.key ? "…" : f.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
