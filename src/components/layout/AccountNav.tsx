"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setAccountContext } from "@/lib/analytics";

export default function AccountNav() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "guest" | "user">("loading");

  useEffect(() => {
    fetch("/api/account")
      .then(async (r) => {
        const b = (await r.json()) as {
          data: { authenticated: boolean; plan?: string };
        };
        setState(b.data.authenticated ? "user" : "guest");
        setAccountContext({ authenticated: b.data.authenticated, plan: b.data.plan });
      })
      .catch(() => setState("guest"));
  }, []);

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccountContext({ authenticated: false });
    setState("guest");
    router.push("/");
    router.refresh();
  }

  if (state === "loading") return <span className="w-16" aria-hidden="true" />;
  if (state === "guest") {
    return (
      <Link
        href="/login"
        className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold text-(--color-ink-700) hover:bg-(--color-accent-50)"
      >
        Sign in
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Link
        href="/dashboard"
        className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-semibold text-(--color-ink-700) hover:bg-(--color-accent-50)"
      >
        Dashboard
      </Link>
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-full px-3 py-2 text-sm font-medium text-(--color-muted) hover:underline"
      >
        Sign out
      </button>
    </span>
  );
}
