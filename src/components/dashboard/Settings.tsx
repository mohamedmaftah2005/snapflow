"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface NotifyPrefs {
  marketingEmailOptIn: boolean;
  downloadNotify: boolean;
  referralNotify: boolean;
  affiliateNotify: boolean;
}

const PREF_LABELS: { key: keyof NotifyPrefs; label: string; hint: string }[] = [
  { key: "downloadNotify", label: "Download updates", hint: "Completed and failed download notifications." },
  { key: "referralNotify", label: "Referral rewards", hint: "When a referral qualifies or is rewarded." },
  { key: "affiliateNotify", label: "Affiliate updates", hint: "Affiliate application decisions." },
  { key: "marketingEmailOptIn", label: "Product emails", hint: "Occasional tips and announcements. Billing and security emails are always on." },
];

export default function Settings() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then(async (res) => {
        if (!res.ok) return;
        const b = (await res.json()) as { success: boolean; data?: NotifyPrefs };
        if (b.success && b.data) setPrefs(b.data);
      })
      .catch(() => undefined);
  }, []);

  async function togglePref(key: keyof NotifyPrefs): Promise<void> {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) {
        setPrefs(prefs);
        setMsg("Could not save notification preference.");
      }
    } catch {
      setPrefs(prefs);
      setMsg("Network error.");
    }
  }

  async function post(url: string, body: unknown): Promise<boolean> {
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!b.success) {
        setMsg(b.error?.message ?? "Failed.");
        return false;
      }
      return true;
    } catch {
      setMsg("Network error.");
      return false;
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Settings</h1>

      <section className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="font-bold">Display name</h2>
        <div className="mt-2 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
            className="h-11 flex-1 rounded-xl border border-(--color-border) px-3" />
          <button type="button"
            onClick={async () => {
              const res = await fetch("/api/account/name", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
              setMsg(res.ok ? "Name updated." : "Could not update name.");
            }}
            className="rounded-xl bg-(--color-ink-950) px-4 text-sm font-bold text-(--color-paper)">
            Save
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="font-bold">Change password</h2>
        <div className="mt-2 space-y-2">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-(--color-border) px-3" />
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (10+ chars, letters + numbers)" autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-(--color-border) px-3" />
          <button type="button"
            onClick={async () => {
              if (await post("/api/account/password", { current, next })) {
                setMsg("Password changed. All sessions were signed out — please sign in again.");
                setCurrent("");
                setNext("");
              }
            }}
            className="rounded-xl bg-(--color-ink-950) px-4 py-2.5 text-sm font-bold text-(--color-paper)">
            Change password
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="font-bold">Notifications</h2>
        <p className="mt-1 text-sm text-(--color-ink-700)">
          Billing and security notifications are always on.
        </p>
        {prefs ? (
          <ul className="mt-3 space-y-2">
            {PREF_LABELS.map(({ key, label, hint }) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-(--color-muted)">{hint}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[key]}
                  aria-label={label}
                  onClick={() => void togglePref(key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prefs[key] ? "bg-(--color-ink-950)" : "bg-slate-300"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-0.5 size-5 rounded-full bg-(--color-surface) shadow transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-(--color-muted)">Sign in to manage notification preferences.</p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-5">
        <h2 className="font-bold text-(--color-error-600)">Delete account</h2>
        <p className="mt-1 text-sm text-(--color-ink-700)">
          Anonymizes your profile and signs you out. Cancel any subscription first.
          Billing records are retained anonymously where required.
        </p>
        <div className="mt-2 flex gap-2">
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Type DELETE to confirm'
            className="h-11 flex-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-3" />
          <button type="button"
            onClick={async () => {
              if (await post("/api/account/delete", { confirm })) router.push("/");
            }}
            className="rounded-xl border border-red-300 dark:border-red-800 bg-(--color-surface) px-4 text-sm font-bold text-(--color-error-600)">
            Delete
          </button>
        </div>
      </section>

      {msg ? <p role="status" className="mt-3 text-sm font-medium">{msg}</p> : null}
    </main>
  );
}
