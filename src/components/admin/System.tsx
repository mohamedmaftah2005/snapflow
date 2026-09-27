"use client";

import { Badge, useAdminApi } from "@/components/admin/ui";

interface SystemData {
  overall: string;
  services: Record<string, { state: string; detail?: string }>;
}

export default function System() {
  const { data, error, loading, reload } = useAdminApi<SystemData>("/api/admin/system");

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Unavailable."}</p>;

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">System</h1>
        <Badge value={data.overall} />
        <button type="button" onClick={reload} className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-bold">
          Refresh
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {Object.entries(data.services).map(([name, s]) => (
          <li key={name} className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm">
            <div>
              <p className="font-bold capitalize">{name}</p>
              {s.detail ? <p className="text-xs text-(--color-muted)">{s.detail}</p> : null}
            </div>
            <Badge value={s.state} />
          </li>
        ))}
      </ul>
    </div>
  );
}
