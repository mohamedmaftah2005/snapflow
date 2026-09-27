"use client";

import Link from "next/link";
import { Badge, Card, Empty, useAdminApi } from "@/components/admin/ui";

interface DashboardData {
  users: { total: number; new24h: number };
  jobs: { today: number; thisWeek: number; byStatus: Record<string, number>; successRate: number | null };
  providers: { provider: string; total: number; failed: number; avgMs: number | null }[];
  topErrors: { code: string; count: number }[];
}

export default function AdminDashboard() {
  const { data, error, loading } = useAdminApi<DashboardData>("/api/admin/dashboard");

  if (loading) return <p className="text-sm">Loading dashboard…</p>;
  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p role="alert" className="mt-2 text-sm text-(--color-error-600)">
          {error ?? "Unavailable."} (Admin or Operator role required.)
        </p>
        <Link className="text-sm font-semibold text-(--color-accent-600) hover:underline" href="/login">Sign in</Link>
      </div>
    );
  }

  const kpis: [string, string][] = [
    ["Users", String(data.users.total)],
    ["New (24h)", String(data.users.new24h)],
    ["Downloads today", String(data.jobs.today)],
    ["Downloads (7d)", String(data.jobs.thisWeek)],
    ["Success rate", data.jobs.successRate === null ? "—" : `${data.jobs.successRate}%`],
    ["Queued", String(data.jobs.byStatus.QUEUED ?? 0)],
    ["Processing", String((data.jobs.byStatus.PROCESSING ?? 0) + (data.jobs.byStatus.UPLOADING ?? 0))],
    ["Failed", String(data.jobs.byStatus.FAILED ?? 0)],
  ];

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
            <p className="text-xs font-bold tracking-widest text-(--color-muted) uppercase">{k}</p>
            <p className="mt-1 text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card title="Providers (7d)">
          {data.providers.length === 0 ? <Empty text="No jobs in the last 7 days." /> : (
            <ul className="space-y-2">
              {data.providers.map((p) => (
                <li key={p.provider} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{p.provider}</span>
                  <span className="text-(--color-muted)">
                    {p.total} jobs · {p.total > 0 ? Math.round(((p.total - p.failed) / p.total) * 1000) / 10 : "—"}% ok
                    {p.avgMs !== null ? ` · avg ${Math.round(p.avgMs / 100) / 10}s` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Top failure codes (7d)">
          {data.topErrors.length === 0 ? <Empty text="No failed jobs in the last 7 days." /> : (
            <ul className="space-y-2">
              {data.topErrors.map((e) => (
                <li key={e.code} className="flex items-center justify-between text-sm">
                  <Badge value={e.code} />
                  <span className="font-bold">{e.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
