"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthForm({
  mode,
  token,
  notice,
}: {
  mode: "login" | "register" | "forgot" | "reset";
  token?: string;
  /** One-time context notice (e.g. session expiry), set by the page. */
  notice?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const endpoint =
    mode === "login"
      ? "/api/auth/login"
      : mode === "register"
        ? "/api/auth/register"
        : mode === "forgot"
          ? "/api/auth/forgot"
          : "/api/auth/reset";

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, string> =
        mode === "forgot"
          ? { email }
          : mode === "reset"
            ? { token: token ?? "", password }
            : mode === "register"
              ? { email, password, ...(name.trim() ? { name: name.trim() } : {}) }
              : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { success: boolean; error?: { message: string }; data?: { message?: string; reset?: boolean } };
      if (!data.success) {
        setError(data.error?.message ?? "Something went wrong.");
        return;
      }
      if (mode === "forgot") {
        setDone(data.data?.message ?? "Check your email.");
        return;
      }
      if (mode === "reset") {
        // The API returns success:true with reset:false for invalid/expired
        // tokens (generic by design). Never claim success in that case.
        if (data.data?.reset === false) {
          setError("This reset link is invalid or has expired. Request a new one from the forgot-password page.");
          return;
        }
        setDone("Password updated. You can now sign in.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    login: ["Welcome back", "Sign in to see your plan, usage, and history."],
    register: ["Create your account", "Free forever tier. No card required."],
    forgot: ["Reset your password", "We'll email you a one-hour reset link."],
    reset: ["Choose a new password", "At least 10 characters with letters and numbers."],
  } as const;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">{titles[mode][0]}</h1>
      <p className="mt-2 text-sm text-(--color-ink-700)">{titles[mode][1]}</p>
      {notice ? (
        <p role="status" className="mt-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-100">
          {notice}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-3xl border border-(--color-border) bg-(--color-surface) p-5 shadow-(--shadow-card)">
        {(mode === "login" || mode === "register" || mode === "forgot") && (
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold">Email</label>
            <input
              id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-xl border border-(--color-border) px-3 text-[16px]"
            />
          </div>
        )}
        {mode === "register" && (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-semibold">Name (optional)</label>
            <input
              id="name" type="text" autoComplete="name" value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 w-full rounded-xl border border-(--color-border) px-3 text-[16px]"
            />
          </div>
        )}
        {(mode === "login" || mode === "register" || mode === "reset") && (
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold">
              {mode === "reset" ? "New password" : "Password"}
            </label>
            <input
              id="password" type="password" required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl border border-(--color-border) px-3 text-[16px]"
              aria-describedby={mode === "register" ? "password-rules" : undefined}
            />
            {mode === "register" ? (
              <p id="password-rules" className="mt-1 text-xs text-(--color-muted)">
                At least 10 characters with letters and numbers.
              </p>
            ) : null}
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-(--color-error-600)">{error}</p> : null}
        {done ? <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{done}</p> : null}
        <button
          type="submit" disabled={busy}
          className="h-[52px] w-full rounded-2xl bg-(--color-accent-600) text-[16px] font-bold text-(--color-paper) disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-(--color-ink-700)">
        {mode === "login" ? (
          <>No account? <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/register">Create one</Link> · <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/forgot-password">Forgot password?</Link></>
        ) : mode === "register" ? (
          <>Have an account? <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/login">Sign in</Link></>
        ) : (
          <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/login">Back to sign in</Link>
        )}
      </p>
    </main>
  );
}
