import type { Metadata } from "next";
import BatchWorkspace from "@/components/batch/BatchWorkspace";

export const metadata: Metadata = {
  title: "Batch download — SnapFlow",
  description: "Download multiple public TikTok links at once with per-link validation, progress, retry, and ZIP packaging.",
  alternates: { canonical: "/batch" },
  openGraph: { title: "Batch download — SnapFlow", description: "Queue multiple links, track progress, retry failures, download a ZIP.", url: "/batch" },
};

export default function BatchPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
      <section className="mx-auto max-w-3xl pt-10 text-center sm:pt-14">
        <h1 className="text-4xl font-extrabold tracking-tight text-(--color-ink-950) sm:text-5xl">
          Batch downloads.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-(--color-ink-700)">
          Paste several public links. Each is validated on its own — one bad link never sinks the batch.
        </p>
      </section>
      <div className="mx-auto mt-8 max-w-2xl">
        <BatchWorkspace />
      </div>
    </main>
  );
}
