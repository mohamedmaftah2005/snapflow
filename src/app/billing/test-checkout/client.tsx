"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TestCheckoutClient({ session }: { session: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "pay" | "cancel"): Promise<void> {
    setBusy(true);
    const res = await fetch("/api/billing/test-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, action }),
    });
    setBusy(false);
    if (res.ok) router.push(action === "pay" ? "/dashboard/billing?checkout=success" : "/pricing?checkout=cancelled");
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-14 text-center sm:px-6">
      <p className="text-xs font-bold tracking-widest text-amber-700 dark:text-amber-300 uppercase">Test checkout — no real payment</p>
      <h1 className="mt-2 text-2xl font-extrabold">Premium — $5/mo (simulated)</h1>
      <div className="mt-6 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void act("pay")}
          className="flex-1 rounded-full bg-(--color-ink-950) py-3 text-sm font-bold text-(--color-paper) disabled:opacity-60">
          Pay (test)
        </button>
        <button type="button" disabled={busy} onClick={() => void act("cancel")}
          className="flex-1 rounded-full border border-(--color-border) py-3 text-sm font-semibold disabled:opacity-60">
          Cancel
        </button>
      </div>
    </main>
  );
}
