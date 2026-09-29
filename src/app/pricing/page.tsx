import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, effectiveFileCapMB } from "@/lib/billing/plans";
import { env } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Pricing — SnapFlow",
  description: "SnapFlow is free for everyone: unlimited downloads, no account, no card.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing — SnapFlow", description: "Free forever, no account needed.", url: "/pricing" },
};

/**
 * Effective file cap: the service enforces min(plan, env), so the page
 * displays the same value instead of the plan ceiling alone.
 */
function effectiveCapMB(): number {
  return effectiveFileCapMB(PLANS.free.maxFileSizeBytes, env.maxFileSizeBytes);
}

const rows: string[] = [
  "Unlimited downloads",
  `Up to ${effectiveCapMB()} MB per file`,
  "Batch downloads",
  "HD + Full HD quality",
  "Audio extraction (MP3)",
  "No account, no card, no tracking",
];

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-center text-3xl font-extrabold text-(--color-ink-950) sm:text-4xl">Free forever</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-base text-(--color-ink-700)">
        Everything is free. No accounts, no subscriptions, no cards — just paste a link and download.
      </p>
      <div className="mx-auto mt-8 max-w-xl rounded-3xl border-2 border-(--color-accent-600) bg-(--color-surface) p-6">
        <p className="font-bold">Free</p>
        <p className="mt-1 text-3xl font-extrabold">$0<span className="text-base font-medium text-(--color-muted)"> forever</span></p>
        <ul className="mt-4 space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r} className="flex gap-2"><span aria-hidden="true">✓</span>{r}</li>
          ))}
        </ul>
        <Link href="/#download" className="mt-6 block rounded-full bg-(--color-ink-950) py-2.5 text-center text-sm font-bold text-(--color-paper)">
          Start downloading
        </Link>
      </div>
      <p className="mt-4 text-center text-xs text-(--color-muted)">
        Fair use applies: per-request rate limits and queue backpressure keep the service fast for everyone.
      </p>
    </main>
  );
}
