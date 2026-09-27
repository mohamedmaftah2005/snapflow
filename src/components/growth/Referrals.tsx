"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";

interface ReferralData {
  link: string;
  pending: number;
  qualified: number;
  rewarded: number;
  reward: string;
}

export default function Referrals() {
  const router = useRouter();
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/referrals/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?expired=1");
          return;
        }
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const b = (await res.json()) as { data?: ReferralData };
        if (b.data) setData(b.data);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [router]);

  async function copy(): Promise<void> {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      track("referral_link_copied", {});
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  }

  if (!data) {
    return failed ? (
      <p role="alert" className="text-sm text-(--color-error-600)">
        Couldn&apos;t load your referrals.{" "}
        <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
          Try again
        </button>
      </p>
    ) : (
      <p className="text-sm">Loading…</p>
    );
  }
  return (
    <div>
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <p className="text-sm font-bold">Your referral link</p>
        <p className="mt-1 break-all font-mono text-sm">{data.link}</p>
        <button type="button" onClick={() => void copy()}
          className="mt-3 rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-bold text-(--color-paper)">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <p className="mt-2 text-xs text-(--color-muted)">{data.reward}. Friends must verify and save their first download to qualify.</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Pending", data.pending],
          ["Qualified", data.qualified],
          ["Rewarded", data.rewarded],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 text-center">
            <p className="text-2xl font-extrabold">{v}</p>
            <p className="text-xs text-(--color-muted)">{k}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
