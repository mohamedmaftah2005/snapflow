"use client";

import Link from "next/link";
import { ActionForm, Badge, useAdminApi } from "@/components/admin/ui";

interface Detail {
  id: string; provider: string; mediaType?: string; status: string;
  userId: string | null; sourceId?: string; title: string; attempts: number;
  createdAt: number; startedAt?: number; completedAt?: number; expiresAt: number;
  fileSize?: number; items: { id: string; type: string; format: string; container: string; fileSize?: number }[];
  error: { code: string; retryable: boolean } | null;
  retryable: boolean; cancelable: boolean;
}

export default function JobDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useAdminApi<Detail>(`/api/admin/jobs/${id}`);

  if (loading) return <p className="text-sm">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-(--color-error-600)">{error ?? "Not found."}</p>;

  return (
    <div>
      <Link href="/admin/jobs" className="text-sm font-semibold text-(--color-accent-600) hover:underline">← Jobs</Link>
      <h1 className="mt-1 truncate font-mono text-xl font-extrabold">{data.id}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge value={data.status} /><Badge value={data.provider} />
        {data.mediaType ? <Badge value={data.mediaType} /> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-sm">
          <p><span className="text-(--color-muted)">Title:</span> {data.title}</p>
          <p><span className="text-(--color-muted)">User:</span> {data.userId ? <Link className="font-mono text-xs hover:underline" href={`/admin/users/${data.userId}`}>{data.userId}</Link> : "guest"}</p>
          <p><span className="text-(--color-muted)">Attempts:</span> {data.attempts}</p>
          <p><span className="text-(--color-muted)">Created:</span> {new Date(data.createdAt).toLocaleString()}</p>
          <p><span className="text-(--color-muted)">File size:</span> {data.fileSize ?? "—"}</p>
          <p><span className="text-(--color-muted)">Items:</span> {data.items.length}</p>
          {data.error ? (
            <p><span className="text-(--color-muted)">Error:</span> <Badge value={data.error.code} /> {data.error.retryable ? "(retryable)" : "(permanent)"}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <p className="text-sm font-bold">Actions</p>
          <div className="mt-2 space-y-2">
            {data.retryable ? (
              <ActionForm action={`/api/admin/jobs/${data.id}/retry`} target={data.id} button="Retry failed job" onDone={reload} />
            ) : null}
            {data.cancelable ? (
              <ActionForm action={`/api/admin/jobs/${data.id}/cancel`} target={data.id} button="Cancel job" danger onDone={reload} />
            ) : null}
            {data.status === "COMPLETED" ? (
              <ActionForm action={`/api/admin/jobs/${data.id}/expire`} target={data.id} button="Expire now" danger onDone={reload} />
            ) : null}
            {!data.retryable && !data.cancelable && data.status !== "COMPLETED" ? (
              <p className="text-sm text-(--color-muted)">No actions available in this state.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
