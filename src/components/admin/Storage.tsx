"use client";

import { useState } from "react";
import { Card, useAdminApi } from "@/components/admin/ui";

interface StorageData {
  driver: string; activeFilesApprox: number; expiredPending: number; failed: number;
}

export default function Storage() {
  const { data, error, loading, reload } = useAdminApi<StorageData>("/api/admin/storage");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function cleanup(): Promise<void> {
    if (!window.confirm("Run the expiry cleanup sweep now?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/storage", { method: "POST" });
      const b = (await res.json()) as { success: boolean; data?: { expired: number; failed: number }; error?: { message: string } };
      if (b.success) {
        setMsg(`Cleanup done: ${b.data?.expired} expired, ${b.data?.failed} failed.`);
        reload();
      } else setMsg(b.error?.message ?? "Failed.");
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
      <h1 className="text-2xl font-extrabold">Storage</h1>
      <div className="mt-4">
        <Card title={`Driver: ${data.driver}`}>
          <ul className="space-y-1 text-sm">
            <li>Active files (approx): <strong>{data.activeFilesApprox}</strong></li>
            <li>Awaiting expiry: <strong>{data.expiredPending}</strong></li>
            <li>Failed jobs holding no files: <strong>{data.failed}</strong></li>
          </ul>
          <button type="button" onClick={() => void cleanup()} disabled={busy}
            className="mt-3 rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper) disabled:opacity-50">
            {busy ? "Working…" : "Run cleanup now"}
          </button>
          {msg ? <p role="status" className="mt-2 text-sm">{msg}</p> : null}
        </Card>
      </div>
    </div>
  );
}
