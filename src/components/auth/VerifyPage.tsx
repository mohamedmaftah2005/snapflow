"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyPage({ token }: { token?: string }) {
  const [state, setState] = useState<"pending" | "ok" | "bad">(!token ? "bad" : "pending");

  useEffect(() => {
    if (!token || state !== "pending") return;
    let live = true;
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const b = (await r.json()) as { data?: { verified?: boolean } };
        if (live) setState(b.data?.verified ? "ok" : "bad");
      })
      .catch(() => {
        if (live) setState("bad");
      });
    return () => {
      live = false;
    };
  }, [token, state]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-14 text-center sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Email verification</h1>
      <p className="mt-3 text-sm text-(--color-ink-700)" role="status">
        {state === "pending" ? "Verifying…" : state === "ok" ? "Verified — thank you." : "This link is invalid or expired."}
      </p>
      <Link className="mt-4 inline-block font-semibold text-(--color-accent-600) hover:underline" href="/dashboard">
        Go to dashboard
      </Link>
    </main>
  );
}
