"use client";

import { useCallback, useEffect, useState } from "react";

export function useAdminApi<T>(path: string | null): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    fetch(path)
      .then(async (r) => {
        const b = (await r.json()) as { success: boolean; data?: T; error?: { message: string } };
        if (!live) return;
        if (b.success) setData((b.data ?? null) as T | null);
        else setError(b.error?.message ?? `Request failed (${r.status})`);
      })
      .catch(() => {
        if (live) setError("Network error.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, nonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);
  return { data, error, loading, reload };
}

const BADGE_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  enabled: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  HEALTHY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  DOWN: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  QUEUED: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  UPLOADING: "bg-blue-100 text-blue-800",
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  EXPIRED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CANCELED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  premium: "bg-violet-100 text-violet-800",
  ADMIN: "bg-violet-100 text-violet-800",
  maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  PAST_DUE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  DEGRADED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

export function Badge({ value }: { value: string }) {
  const cls = BADGE_COLORS[value] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{value}</span>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
      <h2 className="text-sm font-bold tracking-wide text-(--color-ink-950) uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-(--color-accent-50) px-4 py-6 text-center text-sm text-(--color-muted)">{text}</p>;
}

/** POST action with mandatory reason + confirmation. */
export function ActionForm({
  action,
  target,
  button,
  danger,
  onDone,
}: {
  action: string;
  target: string;
  button: string;
  danger?: boolean;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const b = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!b.success) {
        setError(b.error?.message ?? "Action failed.");
        return;
      }
      setConfirming(false);
      setReason("");
      onDone();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`rounded-full px-4 py-2 text-sm font-semibold ${
          danger ? "border border-red-300 dark:border-red-800 text-(--color-error-600)" : "bg-(--color-ink-950) text-(--color-paper)"
        }`}
      >
        {button}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-accent-50) p-3">
      <p className="text-sm font-semibold">
        {button} <span className="font-normal text-(--color-muted)">{target}</span>
      </p>
      <label htmlFor={`reason-${button}`} className="mt-2 block text-xs font-semibold">
        Reason (required, audited)
      </label>
      <input
        id={`reason-${button}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this needed?"
        className="mt-1 h-10 w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 text-sm"
      />
      {error ? <p role="alert" className="mt-1 text-xs text-(--color-error-600)">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button" disabled={busy || reason.trim().length < 3} onClick={() => void run()}
          className="rounded-full bg-(--color-ink-950) px-4 py-1.5 text-sm font-bold text-(--color-paper) disabled:opacity-50"
        >
          {busy ? "Working…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-4 py-1.5 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
