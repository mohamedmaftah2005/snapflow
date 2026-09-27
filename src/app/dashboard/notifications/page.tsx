import type { Metadata } from "next";
import NotificationCenter from "@/components/growth/Notifications";

export const metadata: Metadata = {
  title: "Notifications — SnapFlow",
  robots: { index: false },
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Notifications</h1>
      <div className="mt-6">
        <NotificationCenter />
      </div>
    </main>
  );
}
