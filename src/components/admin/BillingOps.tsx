"use client";

import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface BillingData {
  note: string;
  webhooks: { id: string; provider: string; type: string; status: string; error?: string; receivedAt: number }[];
  total: number;
}

export default function BillingOps() {
  const { data, error, loading } = useAdminApi<BillingData>("/api/admin/billing");

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Unavailable."}</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Billing</h1>
      <p className="mt-1 text-sm text-(--color-muted)">{data.note}</p>
      <h2 className="mt-4 text-lg font-bold">Webhook events ({data.total})</h2>
      {data.webhooks.length === 0 ? <div className="mt-2"><Empty text="No webhook events recorded." /></div> : (
        <ul className="mt-2 space-y-2">
          {data.webhooks.map((w) => (
            <li key={w.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{w.id}</p>
                  <p className="text-(--color-muted)">{w.provider} · {w.type} · {new Date(w.receivedAt).toLocaleString()}</p>
                  {w.error ? <p className="text-(--color-error-600)">Error: {w.error}</p> : null}
                </div>
                <Badge value={w.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
