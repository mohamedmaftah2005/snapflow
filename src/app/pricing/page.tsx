import type { Metadata } from "next";
import Link from "next/link";
import { GUEST_DAILY_DOWNLOADS, PLANS, effectiveFileCapMB, type PlanId } from "@/lib/billing/plans";
import { env } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Pricing — SnapFlow",
  description: "SnapFlow Free vs Premium: daily limits, file sizes, queue priority, and supported providers.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing — SnapFlow", description: "Free forever tier and Premium for heavier use.", url: "/pricing" },
};

/**
 * Effective per-plan file cap: the service enforces min(plan, env), so the
 * page displays the same value instead of the plan ceiling alone.
 */
function effectiveCapMB(plan: PlanId): number {
  return effectiveFileCapMB(PLANS[plan].maxFileSizeBytes, env.maxFileSizeBytes);
}

function batchLimit(plan: PlanId): number {
  return plan === "premium" ? env.premiumBatchLimit : env.freeBatchLimit;
}

function rows(plan: PlanId): string[] {
  const cap = PLANS[plan];
  return [
    `${cap.dailyDownloads === null ? "Unlimited*" : `${cap.dailyDownloads} downloads / day`}`,
    `Up to ${effectiveCapMB(plan)} MB per file`,
    cap.priorityQueue ? "Priority queue" : "Standard queue",
    `Up to ${batchLimit(plan)} URLs per batch`,
    cap.apiAccess ? "API access + webhooks" : "No API access",
    "TikTok downloads",
  ];
}

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-center text-3xl font-extrabold text-(--color-ink-950) sm:text-4xl">Simple pricing</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-base text-(--color-ink-700)">
        Start free, no card required. Guests get {GUEST_DAILY_DOWNLOADS} downloads a day without an account.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-(--color-border) bg-(--color-surface) p-6">
          <p className="font-bold">Free</p>
          <p className="mt-1 text-3xl font-extrabold">$0</p>
          <ul className="mt-4 space-y-2 text-sm">
            {rows("free").map((r) => (
              <li key={r} className="flex gap-2"><span aria-hidden="true">✓</span>{r}</li>
            ))}
          </ul>
          <Link href="/register" className="mt-6 block rounded-full border border-(--color-border) py-2.5 text-center text-sm font-bold">
            Create free account
          </Link>
        </div>
        <div className="rounded-3xl border-2 border-(--color-accent-600) bg-(--color-surface) p-6">
          <p className="font-bold">Premium</p>
          <p className="mt-1 text-3xl font-extrabold">$5<span className="text-base font-medium text-(--color-muted)">/mo</span></p>
          <ul className="mt-4 space-y-2 text-sm">
            {rows("premium").map((r) => (
              <li key={r} className="flex gap-2"><span aria-hidden="true">✓</span>{r}</li>
            ))}
          </ul>
          <Link href="/dashboard/billing" className="mt-6 block rounded-full bg-(--color-ink-950) py-2.5 text-center text-sm font-bold text-(--color-paper)">
            Upgrade
          </Link>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-(--color-muted)">
        *Premium has no daily download cap but standard abuse protection still applies.
        Cancel anytime — you keep Premium until the paid period ends.
      </p>
    </main>
  );
}
