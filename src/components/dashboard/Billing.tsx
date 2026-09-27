"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

interface Sub {
  plan: string;
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
}

export default function Billing() {
  const router = useRouter();
  const params = useSearchParams();
  const justCheckedOut = params.get("checkout") === "success";
  const [sub, setSub] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // After a Stripe redirect the webhook may not have arrived yet: poll
    // briefly for the subscription instead of showing a stale Free plan.
    // Webhook state stays authoritative — this only re-reads it.
    let attempts = 0;
    async function load(): Promise<void> {
      try {
        const r = await fetch("/api/billing/subscription");
        if (!live) return;
        if (r.status === 401) {
          router.push("/login?expired=1");
          return;
        }
        const b = (await r.json()) as { data: Sub };
        if (live) setSub(b.data);
        if (justCheckedOut && b.data.plan !== "premium" && attempts < 6) {
          attempts += 1;
          window.setTimeout(() => void load(), 5000);
        }
      } catch {
        // keep last state; banner below still explains the delay
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [router, justCheckedOut]);

  async function upgrade(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      track("checkout_started", {});
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const b = (await res.json()) as { success: boolean; data?: { url: string }; error?: { message: string } };
      if (b.success && b.data?.url) window.location.href = b.data.url;
      else setMsg(b.error?.message ?? "Checkout unavailable.");
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (!window.confirm("Cancel at the end of the paid period? You keep Premium until then.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (res.ok) window.location.reload();
      else setMsg("Could not cancel right now.");
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!sub) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6">
        <p className="text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Billing</h1>
      {justCheckedOut && sub?.plan !== "premium" ? (
        <p role="status" className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-100">
          Payment received — your subscription activates automatically once our
          payment provider confirms it (usually under a minute). This page
          updates on its own; no need to pay again.
        </p>
      ) : null}
      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <p className="text-sm text-(--color-muted)">Current plan</p>
        <p className="text-xl font-extrabold capitalize">{sub.plan}</p>
        {sub.subscription ? (
          <div className="mt-2 text-sm">
            <p>Status: <span className="font-semibold">{sub.subscription.status === "PAST_DUE" ? "Past due" : sub.subscription.status}</span></p>
            {sub.subscription.status === "PAST_DUE" ? (
              <p className="mt-1 rounded-xl bg-amber-50 dark:bg-amber-950 p-3 text-amber-900 dark:text-amber-100">
                Your last payment didn&apos;t go through. Premium stays active
                for now — if this persists, contact{" "}
                <Link className="font-semibold underline" href="/contact">support</Link> so
                we can help update your payment method.
              </p>
            ) : null}
            {sub.subscription.currentPeriodEnd ? (
              <p>Renews/ends: {new Date(sub.subscription.currentPeriodEnd).toLocaleDateString()}</p>
            ) : null}
            {sub.subscription.cancelAtPeriodEnd ? (
              <p className="font-medium text-amber-700 dark:text-amber-300">Cancels at period end — Premium until then.</p>
            ) : (
              <button type="button" onClick={cancel} disabled={busy} className="mt-3 rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold disabled:opacity-60">
                Cancel subscription
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={upgrade} disabled={busy} className="mt-3 rounded-full bg-(--color-ink-950) px-5 py-2.5 text-sm font-bold text-(--color-paper) disabled:opacity-60">
            {busy ? "Please wait…" : "Upgrade to Premium"}
          </button>
        )}
        {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
      </div>
      <p className="mt-3 text-sm">
        <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/pricing">Compare plans</Link>
      </p>
    </main>
  );
}
