"use client";

import { Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface AbuseData {
  suspendedUsers: { id: string; email: string; createdAt: number }[];
  suspendedTotal: number;
  topFailureCodes: { code: string; count: number }[];
  recentFailedJobs: { id: string; provider: string; errorCode?: string; createdAt: number }[];
}

export default function Abuse() {
  const { data, error, loading } = useAdminApi<AbuseData>("/api/admin/abuse");

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Unavailable."}</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Abuse signals</h1>
      <p className="mt-1 text-sm text-(--color-muted)">
        Aggregated operational signals only. Restrictions are manual and audited — never automatic bans.
      </p>
      <h2 className="mt-4 text-lg font-bold">Suspended accounts ({data.suspendedTotal})</h2>
      {data.suspendedUsers.length === 0 ? <div className="mt-2"><Empty text="No suspended users." /></div> : (
        <ul className="mt-2 space-y-2">
          {data.suspendedUsers.map((u) => (
            <li key={u.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm">
              <span className="font-semibold">{u.email}</span>{" "}
              <span className="font-mono text-xs text-(--color-muted)">{u.id}</span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-6 text-lg font-bold">Top failure codes (7d)</h2>
      {data.topFailureCodes.length === 0 ? <div className="mt-2"><Empty text="No failures recorded." /></div> : (
        <ul className="mt-2 space-y-2">
          {data.topFailureCodes.map((e) => (
            <li key={e.code} className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm">
              <Badge value={e.code} /><strong>{e.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
