"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Onboarding from "./Onboarding";

interface Account {
  authenticated: boolean;
  plan?: string;
  user?: { email: string; name?: string; emailVerified: boolean };
  usage?: { downloads: number; limit: number | null };
}

interface HistJob {
  id: string;
  provider: string;
  mediaType: string;
  title: string;
  status: string;
  createdAt: string;
  expired: boolean;
}
export default function Dashboard() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [jobs, setJobs] = useState<HistJob[]>([]);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function resend(): Promise<void> {
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", { method: "POST" });
      setResent(true);
    } catch {
      // generic outcome by design; button simply re-enables
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    fetch("/api/account")
      .then(async (r) => {
        const b = (await r.json()) as { data: Account };
        setAccount(b.data);
        if (!b.data.authenticated) router.push("/login?expired=1");
      })
      .catch(() => undefined);
    fetch("/api/downloads?limit=20")
      .then(async (r) => {
        if (!r.ok) return;
        const b = (await r.json()) as { data: { jobs: HistJob[] } };
        setJobs(b.data.jobs);
      })
      .catch(() => undefined);
  }, [router]);

  if (!account) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6">
        <p className="text-sm text-(--color-ink-700)">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <p className="text-xs font-bold tracking-widest text-(--color-muted) uppercase">Plan</p>
          <p className="mt-1 text-xl font-extrabold capitalize">{account.plan}</p>
          <Link className="mt-2 inline-block text-sm font-semibold text-(--color-accent-600) hover:underline" href="/pricing">
            {account.plan === "premium" ? "Manage billing" : "Upgrade"}
          </Link>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <p className="text-xs font-bold tracking-widest text-(--color-muted) uppercase">Used today</p>
          <p className="mt-1 text-xl font-extrabold">
            {account.usage?.downloads ?? 0}
            <span className="text-sm font-medium text-(--color-muted)"> / {account.usage?.limit ?? "∞"}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <p className="text-xs font-bold tracking-widest text-(--color-muted) uppercase">Account</p>
          <p className="mt-1 truncate text-sm font-semibold">{account.user?.email}</p>
          <p className="text-xs text-(--color-muted)">
            {account.user?.emailVerified ? "Email verified" : "Email not verified yet"}
          </p>
          {!account.user?.emailVerified ? (
            <button type="button" onClick={() => void resend()} disabled={resending}
              className="mt-2 text-sm font-semibold text-(--color-accent-600) hover:underline disabled:opacity-60">
              {resending ? "Sending…" : resent ? "Link sent — check your inbox" : "Resend verification email"}
            </button>
          ) : null}
          <Link className="mt-2 block text-sm font-semibold text-(--color-accent-600) hover:underline" href="/dashboard/settings">
            Settings
          </Link>
        </div>
      </div>
      <h2 className="mt-10 text-xl font-bold text-(--color-ink-950)">Recent downloads</h2>
      <Onboarding hasCompletedJob={jobs.some((j) => j.status === "COMPLETED")} />
      {jobs.length === 0 ? (
        <p className="mt-3 text-sm text-(--color-ink-700)">
          Nothing yet. <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/#download">Download something</Link>.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
              <div className="min-w-0">
                <Link href={`/dashboard/downloads/${j.id}`} className="truncate text-sm font-semibold hover:underline">
                  {j.title}
                </Link>
                <p className="text-xs text-(--color-muted)">
                  {j.provider} · {new Date(j.createdAt).toLocaleDateString()} · {j.status.toLowerCase()}
                  {j.expired ? " · media expired" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
