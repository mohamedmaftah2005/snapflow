"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WEBHOOK_EVENTS } from "@/lib/api/types";

interface Endpoint {
  id: string; url: string; events: string[]; active: boolean;
  consecutiveFailures: number; lastDeliveredAt?: number; createdAt: number;
}

interface Delivery {
  id: string; eventId: string; eventType: string; status: string;
  httpStatus?: number; attempts: number; error?: string; createdAt: number;
}

export default function Webhooks() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["download.completed", "download.failed"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, Delivery[]>>({});
  const [refresh, setRefresh] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/developer/webhooks")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?expired=1");
          return;
        }
        const b = (await res.json()) as { data?: { endpoints: Endpoint[] } };
        setEndpoints(b.data?.endpoints ?? []);
      })
      .catch(() => undefined);
  }, [router, refresh]);

  function toggleEvent(e: string): void {
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }

  async function create(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/developer/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events }),
      });
      const b = (await res.json()) as { success: boolean; data?: { secret: string }; error?: { message: string } };
      if (!b.success || !b.data) {
        setMsg(b.error?.message ?? "Could not create the endpoint.");
        return;
      }
      setSecret(b.data.secret);
      setUrl("");
      setRefresh((r) => r + 1);
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<void> {
    const res = await fetch(`/api/developer/webhooks/${id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const b = (await res.json().catch(() => null)) as { data?: { secret?: string }; error?: { message: string } } | null;
    if (b?.data && "secret" in b.data && typeof (b.data as { secret?: string }).secret === "string") {
      setSecret((b.data as { secret: string }).secret);
    } else if (!res.ok) {
      setMsg(b?.error?.message ?? "Action failed.");
    }
    setRefresh((r) => r + 1);
  }

  async function showDeliveries(id: string): Promise<void> {
    if (open[id]) {
      setOpen((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/developer/webhooks/${id}/deliveries`);
    const b = (await res.json()) as { data?: { deliveries: Delivery[] } };
    setOpen((o) => ({ ...o, [id]: b.data?.deliveries ?? [] }));
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Webhooks</h1>
      <p className="mt-2 text-sm text-(--color-ink-700)">
        HTTPS endpoints receive signed event payloads. Secrets are shown once.
      </p>

      {secret ? (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
          <p className="font-bold">Copy this secret now — it will only be shown once.</p>
          <p className="mt-1 break-all font-mono text-sm">{secret}</p>
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="font-bold">New endpoint</h2>
        <label htmlFor="wh-url" className="mt-3 block text-sm font-semibold">URL (HTTPS)</label>
        <input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/snapflow"
          className="mt-1 h-11 w-full rounded-xl border border-(--color-border) px-3" />
        <p className="mt-3 text-sm font-semibold">Events</p>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
              <span className="font-mono text-xs">{e}</span>
            </label>
          ))}
        </div>
        {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
        <button type="button" onClick={() => void create()} disabled={busy || !url.trim()}
          className="mt-3 rounded-full bg-(--color-ink-950) px-5 py-2.5 text-sm font-bold text-(--color-paper) disabled:opacity-60">
          {busy ? "Creating…" : "Create endpoint"}
        </button>
      </section>

      <h2 className="mt-8 text-xl font-bold">Your endpoints</h2>
      {endpoints.length === 0 ? <p className="mt-2 text-sm">No endpoints yet.</p> : (
        <ul className="mt-3 space-y-3">
          {endpoints.map((ep) => (
            <li key={ep.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
              <p className="truncate text-sm font-bold">{ep.url}</p>
              <p className="mt-1 text-xs text-(--color-muted)">
                {ep.active ? "active" : "disabled"} · {ep.events.join(", ")}
                {ep.consecutiveFailures > 0 ? ` · ${ep.consecutiveFailures} consecutive failures` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void act(ep.id, "/test", "POST")}
                  className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                  Send test event
                </button>
                <button type="button" onClick={() => void act(ep.id, "", "PATCH", { active: !ep.active })}
                  className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                  {ep.active ? "Disable" : "Enable"}
                </button>
                <button type="button" onClick={() => {
                  if (window.confirm("Rotate the secret? The old one stops working immediately.")) void act(ep.id, "/rotate", "POST");
                }}
                  className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                  Rotate secret
                </button>
                <button type="button" onClick={() => void showDeliveries(ep.id)}
                  className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-semibold">
                  Deliveries
                </button>
                <button type="button" onClick={() => {
                  if (window.confirm("Delete this endpoint and its delivery log?")) void act(ep.id, "", "DELETE");
                }}
                  className="rounded-full border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-(--color-error-600)">
                  Delete
                </button>
              </div>
              {open[ep.id] ? (
                <ul className="mt-3 space-y-1 border-t border-(--color-border) pt-2">
                  {open[ep.id].length === 0 ? <li className="text-xs text-(--color-muted)">No deliveries yet.</li> : null}
                  {open[ep.id].map((d) => (
                    <li key={d.id} className="text-xs">
                      <span className="font-mono">{d.eventType}</span> · {d.status}
                      {d.httpStatus ? ` · HTTP ${d.httpStatus}` : ""} · {d.attempts} attempt(s)
                      {d.error ? ` · ${d.error.slice(0, 120)}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
