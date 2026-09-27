"use client";

import { useEffect, useState } from "react";

const EXPERIMENT_ID = "hero_cta";
const ROLLOUT_PERCENT = 50; // must match EXPERIMENTS.hero_cta server-side
const ANON_KEY = "sf_anon";

const CONTROL_COPY = "Paste a public TikTok link and get your media ready in seconds. Fast, clean, and mobile-first.";
const VARIANT_COPY = "Paste a public link — your download is ready in seconds. Free to try, no account needed.";

function randomAnonId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Client-side assignment for the hero_cta experiment. Mirrors the server
 * rule in lib/growth/experiments.ts (SHA-256 of "hero_cta:<subject>", first
 * two bytes big-endian mod 100 for the rollout bucket, third byte parity
 * for the variant). Exposure is render-only: no server-side exposure event
 * is recorded (see docs/growth.md limitations).
 */
async function assignVariant(subjectId: string): Promise<"control" | "variant"> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${EXPERIMENT_ID}:${subjectId}`)
    );
    const h = new Uint8Array(digest);
    const bucket = ((h[0]! << 8) | h[1]!) % 100;
    if (bucket >= ROLLOUT_PERCENT) return "control";
    return h[2]! % 2 === 0 ? "control" : "variant";
  } catch {
    return "control";
  }
}

/** Hero sub-copy experiment. Renders control until assignment resolves. */
export default function ExperimentCta() {
  const [variant, setVariant] = useState<"control" | "variant">("control");

  useEffect(() => {
    let live = true;
    try {
      let anon = window.localStorage.getItem(ANON_KEY);
      if (!anon) {
        anon = randomAnonId();
        window.localStorage.setItem(ANON_KEY, anon);
      }
      void assignVariant(anon).then((v) => {
        if (live) setVariant(v);
      });
    } catch {
      // storage unavailable — stay on control
    }
    return () => {
      live = false;
    };
  }, []);

  return (
    <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-(--color-ink-700) sm:text-lg">
      {variant === "variant" ? VARIANT_COPY : CONTROL_COPY}
    </p>
  );
}
