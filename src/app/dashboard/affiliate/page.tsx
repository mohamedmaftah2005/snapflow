import type { Metadata } from "next";
import Affiliate from "@/components/growth/Affiliate";

export const metadata: Metadata = {
  title: "Affiliate — SnapFlow",
  robots: { index: false },
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Affiliate program</h1>
      <div className="mt-6">
        <Affiliate />
      </div>
    </main>
  );
}
