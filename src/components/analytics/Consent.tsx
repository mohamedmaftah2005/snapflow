"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setConsent, track } from "@/lib/analytics";

function enabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true";
}

/** Fires a single page_view per path (consent + flag gated). */
export function PageViewTracker() {
  const path = usePathname();
  useEffect(() => {
    if (path) track("page_view", { path });
  }, [path]);
  return null;
}

/** Bottom banner. Renders nothing when disabled or already answered. */
export function ConsentBanner() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (!enabled() || typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("snapflow-consent") === null;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent): void => {
      // Decline on Escape: consent must never trap or coerce.
      if (e.key === "Escape") {
        setConsent(false);
        setVisible(false);
      }
    };
    window.addEventListener("keydown", onKey);
    // Initial focus on the Decline action (the safe default).
    document.getElementById("consent-decline")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-desc"
      aria-label="Analytics consent"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 shadow-(--shadow-card)"
    >
      <p id="consent-title" className="text-sm font-bold text-(--color-ink-950)">Analytics consent</p>
      <p id="consent-desc" className="mt-1 text-sm leading-6 text-(--color-ink-700)">
        We measure anonymous usage (page views, download outcomes) to improve SnapFlow. No URLs,
        no content, no accounts. Allow it?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setConsent(true);
            setVisible(false);
          }}
          className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-semibold text-(--color-paper)"
        >
          Allow
        </button>
        <button
          type="button"
          id="consent-decline"
          onClick={() => {
            setConsent(false);
            setVisible(false);
          }}
          className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold text-(--color-ink-700)"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
