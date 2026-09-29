"use client";

import type { DownloadStatus } from "@/types/downloader";

interface DownloadButtonProps {
  status: DownloadStatus;
}

export default function DownloadButton({ status }: DownloadButtonProps) {
  const busy = status === "validating" || status === "queued" || status === "processing";
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-(--color-accent-600) to-(--color-accent-700) text-[16px] font-bold text-(--color-paper) shadow-(--shadow-pop) transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {busy ? (
        <>
          <span aria-hidden="true" className="spinner inline-block size-5 rounded-full border-2 border-(--color-paper)/40 border-t-(--color-paper)" />
          {status === "validating" ? "Validating…" : status === "queued" ? "Queued…" : "Processing…"}
        </>
      ) : (
        "Download"
      )}
    </button>
  );
}
