import type { Metadata } from "next";
import History from "@/components/dashboard/History";

export const metadata: Metadata = {
  title: "History — SnapFlow",
  robots: { index: false },
};

export default function HistoryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <History />
    </main>
  );
}
