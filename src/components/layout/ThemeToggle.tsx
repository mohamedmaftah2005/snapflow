"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, applyTheme, resolveTheme, type Theme } from "@/lib/theme";

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/**
 * Header theme toggle. Persists to localStorage, defaults to the OS
 * preference, and applies instantly without a flash (see ThemeScript in
 * the root layout, which sets the class before first paint).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    // Async bootstrap (same pattern as other client islands): read the
    // stored choice, then commit state. Never throws without storage.
    void (async () => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        // storage unavailable — fall back to OS preference
      }
      const prefersDark =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = resolveTheme(stored, prefersDark);
      if (!live) return;
      setTheme(next);
      applyTheme(next);
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  function toggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // private mode etc. — theme still applies for the session
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === "dark"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-(--color-border) bg-(--color-surface) text-(--color-ink-700) transition-colors hover:bg-(--color-accent-50)"
    >
      {/* Render the moon in light mode (action: go dark) and vice versa. */}
      <span aria-hidden="true" className={ready ? undefined : "invisible"}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}
