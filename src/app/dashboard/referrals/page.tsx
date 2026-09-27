import type { Metadata } from "next";
import Referrals from "@/components/growth/Referrals";

export const metadata: Metadata = {
  title: "Referrals — SnapFlow",
  robots: { index: false },
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Referrals</h1>
      <p className="mt-2 text-sm text-(--color-ink-700)">
        Share SnapFlow. When someone you refer verifies and saves their first download, you both benefit.
      </p>
      <div className="mt-6">
        <Referrals />
      </div>
    </main>
  );
}
