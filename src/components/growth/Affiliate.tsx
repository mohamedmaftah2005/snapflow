"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AffiliateData {
  application: {
    status: string; code: string; link: string; commissionRate: number;
  } | null;
  conversions?: number;
  pendingCents?: number;
  approvedCents?: number;
  paidCents?: number;
  payouts?: { id: string; amountCents: number; status: string; createdAt: number }[];
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Affiliate() {
  const router = useRouter();
  const [data, setData] = useState<AffiliateData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/affiliates/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?expired=1");
          return;
        }
        const b = (await res.json()) as { data?: AffiliateData };
        if (b.data) setData(b.data);
      })
      .catch(() => undefined);
  }, [router]);

  async function apply(): Promise<void> {
    const res = await fetch("/api/affiliates/mine", { method: "POST" });
    if (res.ok) window.location.reload();
    else setMsg("Could not submit the application.");
  }

  if (!data) return <p className="text-sm">Loading…</p>;
  if (!data.application) {
    return (
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <p className="font-bold">Become an affiliate</p>
        <p className="mt-1 text-sm text-(--color-ink-700)">
          Earn 20% of Premium subscriptions from people you refer. Applications
          are reviewed manually — most are decided within a few days.
        </p>
        {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
        <button type="button" onClick={() => void apply()}
          className="mt-3 rounded-full bg-(--color-ink-950) px-5 py-2.5 text-sm font-bold text-(--color-paper)">
          Apply now
        </button>
      </div>
    );
  }
  const app = data.application;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <p className="text-sm text-(--color-muted)">Status: <span className="font-bold text-(--color-ink-950)">{app.status}</span></p>
        {app.status === "ACTIVE" ? (
          <>
            <p className="mt-2 break-all font-mono text-sm">{app.link}</p>
            <p className="mt-1 text-xs text-(--color-muted)">Commission rate: {Math.round(app.commissionRate * 100)}%</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-(--color-ink-700)">
            {app.status === "PENDING" ? "Under review — we will email you the decision." : "This account is suspended. Contact support to appeal."}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Conversions", String(data.conversions ?? 0)],
          ["Pending", dollars(data.pendingCents ?? 0)],
          ["Approved", dollars(data.approvedCents ?? 0)],
          ["Paid", dollars(data.paidCents ?? 0)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 text-center">
            <p className="text-xl font-extrabold">{v}</p>
            <p className="text-xs text-(--color-muted)">{k}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
