"use client";

import Link from "next/link";
import { ActionForm, Badge, Empty, useAdminApi } from "@/components/admin/ui";

interface Detail {
  user: {
    id: string; email: string; name?: string; status: string; role: string;
    plan: string; emailVerified: boolean; createdAt: number; updatedAt: number;
  };
  subscription: { planId: string; status: string; provider: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  usage: { downloads: number; limit: number | null } | null;
  recentJobs: { id: string; provider: string; status: string; title: string; createdAt: string }[];
}

export default function UserDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useAdminApi<Detail>(`/api/admin/users/${id}`);

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Not found."}</p>;
  const u = data.user;

  return (
    <div>
      <Link href="/admin/users" className="text-sm font-semibold text-(--color-accent-600) hover:underline">← Users</Link>
      <h1 className="mt-1 truncate text-2xl font-extrabold">{u.email}</h1>
      <div className="mt-2 flex gap-1.5">
        <Badge value={u.status} /><Badge value={u.role} /><Badge value={u.plan} />
        <Badge value={u.emailVerified ? "VERIFIED" : "UNVERIFIED"} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-sm">
          <p><span className="text-(--color-muted)">ID:</span> <span className="font-mono text-xs">{u.id}</span></p>
          <p><span className="text-(--color-muted)">Name:</span> {u.name ?? "—"}</p>
          <p><span className="text-(--color-muted)">Created:</span> {new Date(u.createdAt).toLocaleString()}</p>
          <p><span className="text-(--color-muted)">Downloads today:</span> {data.usage ? `${data.usage.downloads} / ${data.usage.limit ?? "∞"}` : "—"}</p>
          {data.subscription ? (
            <p><span className="text-(--color-muted)">Subscription:</span> {data.subscription.planId} · {data.subscription.status} · {data.subscription.provider}
              {data.subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}</p>
          ) : (
            <p><span className="text-(--color-muted)">Subscription:</span> none</p>
          )}
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <p className="text-sm font-bold">Actions</p>
          <div className="mt-2 space-y-2">
            {u.status === "ACTIVE" ? (
              <ActionForm action={`/api/admin/users/${u.id}/suspend`} target={u.email} button="Suspend user" danger onDone={reload} />
            ) : u.status === "SUSPENDED" ? (
              <ActionForm action={`/api/admin/users/${u.id}/reactivate`} target={u.email} button="Reactivate user" onDone={reload} />
            ) : null}
          </div>
        </div>
      </div>
      <h2 className="mt-6 text-lg font-bold">Recent jobs</h2>
      {data.recentJobs.length === 0 ? <div className="mt-2"><Empty text="No jobs for this user." /></div> : (
        <ul className="mt-2 space-y-2">
          {data.recentJobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm">
              <Link href={`/admin/jobs/${j.id}`} className="truncate font-semibold hover:underline">{j.title}</Link>
              <Badge value={j.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
