"use client";

import { useState } from "react";
import { Badge, Card, useAdminApi } from "@/components/admin/ui";

interface QueueData {
  name: string; driver: string; waiting: number; active: number; failed: number; delayed: number; paused: boolean;
}

export default function Queues() {
  const { data, error, loading, reload } = useAdminApi<QueueData>("/api/admin/queues");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    if (!data) return;
    if (!window.confirm(data.paused ? "Resume the download queue?" : "Pause the download queue? New jobs will wait.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/queues?action=${data.paused ? "resume" : "pause"}`, { method: "POST" });
      const b = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!b.success) setMsg(b.error?.message ?? "Failed.");
      reload();
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Unavailable."}</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Queues</h1>
      <div className="mt-4">
        <Card title={`${data.name} · ${data.driver}`}>
          <ul className="space-y-1 text-sm">
            <li>Waiting: <strong>{data.waiting}</strong></li>
            <li>Active: <strong>{data.active}</strong></li>
            <li>Failed: <strong>{data.failed}</strong></li>
            <li>Delayed: <strong>{data.delayed}</strong></li>
            <li>Status: <Badge value={data.paused ? "PAUSED" : "ACTIVE"} /></li>
          </ul>
          <div className="mt-3">
            <button type="button" onClick={() => void toggle()} disabled={busy}
              className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper) disabled:opacity-50">
              {busy ? "Working…" : data.paused ? "Resume queue" : "Pause queue"}
            </button>
            {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
