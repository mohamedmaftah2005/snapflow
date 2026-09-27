"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Item {
  id: string; type: string; title: string; body: string; link?: string; createdAt: number;
}

/** Header bell with unread count. Backoff polling (30s → 120s cap). */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let live = true;
    let stopped = false;
    let delay = 30_000;
    async function poll(): Promise<void> {
      // Background tabs don't need fresh badges; reschedule without fetching.
      if (typeof document !== "undefined" && document.hidden) {
        if (live) window.setTimeout(() => void poll(), 60_000);
        return;
      }
      try {
        const res = await fetch("/api/notifications?limit=1");
        if (!live) return;
        if (res.status === 401) {
          // Signed out: stop polling entirely instead of retrying forever.
          setAuthed(false);
          stopped = true;
          return;
        }
        setAuthed(true);
        const b = (await res.json()) as { data?: { unread?: number } };
        if (live && typeof b.data?.unread === "number") setUnread(b.data.unread);
      } catch {
        // offline: stay silent
      } finally {
        if (live && !stopped) {
          delay = Math.min(delay + 30_000, 120_000);
          window.setTimeout(() => void poll(), delay);
        }
      }
    }
    void poll();
    return () => {
      live = false;
    };
  }, []);

  if (!authed) return null;
  return (
    <Link href="/dashboard/notifications" aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
      className="relative grid size-9 place-items-center rounded-xl border border-(--color-border) bg-(--color-surface) text-lg">
      <span aria-hidden="true">🔔</span>
      {unread > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 grid min-size-5 place-items-center rounded-full bg-(--color-error-600) px-1 text-[11px] font-bold text-(--color-paper)">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export default function NotificationCenter() {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/notifications?limit=30")
      .then(async (res) => {
        if (!res.ok) return;
        const b = (await res.json()) as { data?: { notifications: Item[] } };
        setItems(b.data?.notifications ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function markAll(): Promise<void> {
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
    window.location.reload();
  }

  if (!loaded) return <p className="text-sm">Loading…</p>;
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-(--color-muted)">{items.length} recent</p>
        <button type="button" onClick={() => void markAll()}
          className="text-sm font-semibold text-(--color-accent-600) hover:underline">
          Mark all as read
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-(--color-accent-50) px-4 py-6 text-center text-sm text-(--color-muted)">
          Nothing here yet. Completed downloads and rewards will appear.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((n) => (
            <li key={n.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
              <p className="text-sm font-bold">{n.title}</p>
              <p className="mt-0.5 text-sm text-(--color-ink-700)">{n.body}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-(--color-muted)">{new Date(n.createdAt).toLocaleString()}</span>
                {n.link ? (
                  <Link href={n.link} className="text-xs font-semibold text-(--color-accent-600) hover:underline">
                    Open →
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
