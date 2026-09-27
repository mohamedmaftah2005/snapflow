"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-20 text-center sm:px-6">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-error-600) uppercase">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-extrabold text-(--color-ink-950)">Please try again</h1>
      <p className="mt-3 text-sm leading-6 text-(--color-ink-700)">
        An unexpected error occurred. Your link was not lost — try again, or start over.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-(--color-accent-600) px-6 py-3 text-sm font-bold text-(--color-paper)"
        >
          Try again
        </button>
        <Link
          href="/#download"
          className="rounded-full border border-(--color-border) px-6 py-3 text-sm font-semibold text-(--color-ink-700)"
        >
          Downloader
        </Link>
      </div>
    </main>
  );
}
