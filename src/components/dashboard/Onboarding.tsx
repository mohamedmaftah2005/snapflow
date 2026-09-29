"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

const DONE_KEY = "sf_onb_done";

/**
 * Lightweight first-use checklist. Shows only for accounts with no recent
 * downloads that haven't finished or dismissed it. Dismissal persists;
 * completion is recorded when a completed job is observed.
 */
export default function Onboarding({ hasCompletedJob }: { hasCompletedJob: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let live = true;
    // Async bootstrap (same pattern as Dashboard/History): reads storage,
    // then commits visibility. Never renders raw storage errors.
    void (async () => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(DONE_KEY);
      } catch {
        return;
      }
      if (!live || stored) return;
      if (hasCompletedJob) {
        try {
          window.localStorage.setItem(DONE_KEY, "done");
        } catch {
          // ignore
        }
        track("onboarding_completed", {});
        track("first_download_completed", {});
        return;
      }
      setVisible(true);
      track("onboarding_started", {});
    })();
    return () => {
      live = false;
    };
  }, [hasCompletedJob]);

  if (!visible) return null;

  function skip(): void {
    try {
      window.localStorage.setItem(DONE_KEY, "skipped");
    } catch {
      // ignore
    }
    setVisible(false);
    track("onboarding_skipped", {});
  }

  return (
    <section aria-labelledby="onboarding-title" className="mt-6 rounded-2xl border border-(--color-accent-600) bg-(--color-surface) p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="onboarding-title" className="font-bold">Get started in 3 steps</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-(--color-ink-700)">
            <li>
              <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/#download">
                Paste your first TikTok link
              </Link>{" "}
              and hit download.
            </li>
            <li>Wait for processing — it usually takes seconds.</li>
            <li>Find it anytime under <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/dashboard/history">History</Link>.</li>
          </ol>
          <p className="mt-2 text-xs text-(--color-muted)">
            Free forever — no account needed, no download caps.
          </p>
        </div>
        <button type="button" onClick={skip}
          className="shrink-0 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-muted) hover:underline">
          Skip
        </button>
      </div>
    </section>
  );
}
