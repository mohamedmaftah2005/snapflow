"use client";

import { useState } from "react";
import { inputPlaceholder } from "@/lib/providers/client";

interface UrlInputProps {
  id: string;
  value: string;
  disabled?: boolean;
  invalidMessage?: string | null;
  onChange: (value: string) => void;
  onPasteEvent?: () => void;
}

export default function UrlInput({ id, value, disabled, invalidMessage, onChange, onPasteEvent }: UrlInputProps) {
  const [pasted, setPasted] = useState(false);

  async function handlePaste(): Promise<void> {
    if (disabled) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text.trim());
        setPasted(true);
        onPasteEvent?.();
        window.setTimeout(() => setPasted(false), 1600);
      }
    } catch {
      // Clipboard unavailable (permissions / insecure context) — leave manual paste.
      setPasted(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold tracking-wide text-(--color-ink-700) uppercase">
        TikTok URL
      </label>
      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-center rounded-2xl border bg-(--color-surface) p-2 transition-colors ${
          invalidMessage
            ? "border-(--color-error-600)"
            : "border-(--color-border) focus-within:border-(--color-accent-600)"
        }`}
      >
        <input
          id={id}
          name="tiktok-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={inputPlaceholder()}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(invalidMessage)}
          aria-describedby={invalidMessage ? `${id}-error` : undefined}
          className="h-12 w-full flex-1 rounded-xl bg-transparent px-3 text-[16px] text-(--color-ink-950) placeholder:text-[#98a2b3] focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handlePaste}
          disabled={disabled}
          className="h-11 shrink-0 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 text-sm font-semibold text-(--color-ink-700) transition-colors hover:bg-(--color-accent-50) disabled:opacity-60"
        >
          {pasted ? "Pasted ✓" : "Paste"}
        </button>
      </div>
      {invalidMessage ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-(--color-error-600)">
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}
