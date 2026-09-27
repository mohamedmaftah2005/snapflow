import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — SnapFlow",
  description: "The page you are looking for does not exist.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-20 text-center sm:px-6">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">404</p>
      <h1 className="mt-2 text-3xl font-extrabold text-(--color-ink-950)">Page not found</h1>
      <p className="mt-3 text-sm leading-6 text-(--color-ink-700)">
        This page doesn&apos;t exist or was moved. The downloader is one click away.
      </p>
      <Link
        href="/#download"
        className="mt-6 inline-block rounded-full bg-(--color-ink-950) px-6 py-3 text-sm font-bold text-(--color-paper)"
      >
        Back to the downloader
      </Link>
    </main>
  );
}
