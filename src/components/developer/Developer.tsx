"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_SCOPES, type ApiKeyPublic } from "@/lib/api/types";

export default function Developer() {
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["downloads:create", "downloads:read"]);
  const [expiry, setExpiry] = useState("never");
  const [created, setCreated] = useState<{ raw: string; id: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/developer/keys")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?expired=1");
          return;
        }
        const b = (await res.json()) as { data?: { keys: ApiKeyPublic[] } };
        setKeys(b.data?.keys ?? []);
      })
      .catch(() => undefined);
  }, [router, refresh]);

  function toggleScope(s: string): void {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function create(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes, expires: expiry }),
      });
      const b = (await res.json()) as {
        success: boolean;
        data?: { key: ApiKeyPublic; raw: string };
        error?: { message: string };
      };
      if (!b.success || !b.data) {
        setMsg(b.error?.message ?? "Could not create the key.");
        return;
      }
      setCreated({ raw: b.data.raw, id: b.data.key.id });
      setName("");
      setRefresh((r) => r + 1);
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    if (!window.confirm("Revoke this key? Applications using it stop working immediately.")) return;
    await fetch(`/api/developer/keys/${id}/revoke`, { method: "POST" }).catch(() => undefined);
    setCreated((c) => (c?.id === id ? null : c));
    setRefresh((r) => r + 1);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Developer</h1>
      <p className="mt-2 text-sm text-(--color-ink-700)">
        API keys for the <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/openapi.json">v1 API</Link>.
        Keys inherit your plan&apos;s limits. Premium required.
      </p>

      {created ? (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
          <p className="font-bold">Copy your key now — it will only be shown once.</p>
          <p className="mt-1 break-all font-mono text-sm">{created.raw}</p>
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="font-bold">New API key</h2>
        <label htmlFor="key-name" className="mt-3 block text-sm font-semibold">Name</label>
        <input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production app"
          className="mt-1 h-11 w-full rounded-xl border border-(--color-border) px-3" />
        <p className="mt-3 text-sm font-semibold">Permissions (least privilege)</p>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {API_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
              <span className="font-mono text-xs">{s}</span>
            </label>
          ))}
        </div>
        <label htmlFor="key-exp" className="mt-3 block text-sm font-semibold">Expires</label>
        <select id="key-exp" value={expiry} onChange={(e) => setExpiry(e.target.value)}
          className="mt-1 h-11 rounded-xl border border-(--color-border) bg-(--color-surface) px-2 text-sm">
          <option value="never">Never</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="1y">1 year</option>
        </select>
        {msg ? <p role="alert" className="mt-2 text-sm text-(--color-error-600)">{msg}</p> : null}
        <button type="button" onClick={() => void create()} disabled={busy || !name.trim()}
          className="mt-3 rounded-full bg-(--color-ink-950) px-5 py-2.5 text-sm font-bold text-(--color-paper) disabled:opacity-60">
          {busy ? "Creating…" : "Create key"}
        </button>
      </section>

      <h2 className="mt-8 text-xl font-bold">Your keys</h2>
      {keys.length === 0 ? <p className="mt-2 text-sm text-(--color-ink-700)">No keys yet.</p> : (
        <ul className="mt-3 space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{k.name}</p>
                  <p className="font-mono text-xs text-(--color-muted)">{k.prefix}…</p>
                  <p className="mt-1 text-xs text-(--color-muted)">
                    {k.scopes.join(", ")} · created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                    {k.expiresAt ? ` · expires ${new Date(k.expiresAt).toLocaleDateString()}` : ""}
                    {k.revokedAt ? " · REVOKED" : ""}
                  </p>
                </div>
                {!k.revokedAt ? (
                  <button type="button" onClick={() => void revoke(k.id)}
                    className="shrink-0 rounded-full border border-red-300 dark:border-red-800 px-4 py-1.5 text-sm font-semibold text-(--color-error-600)">
                    Revoke
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm">
        <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/dashboard/developer/webhooks">
          Manage webhooks →
        </Link>
      </p>
    </main>
  );
}
