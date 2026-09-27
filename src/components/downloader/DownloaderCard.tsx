"use client";

import { useEffect, useRef, useState } from "react";
import { validateTikTokUrlInput } from "@/lib/validation/url";
import { userMessageFor } from "@/lib/errors";
import { apiDownloader } from "@/services/apiDownloader";
import { track } from "@/lib/analytics";
import type {
  DownloadErrorCode,
  DownloadJob,
  DownloadStatus,
  MediaResult,
} from "@/types/downloader";
import UrlInput from "./UrlInput";
import DownloadButton from "./DownloadButton";
import ProcessingState from "./ProcessingState";
import QualitySelector, { type QualityChoice } from "./QualitySelector";
import ResultCard from "./ResultCard";
import ErrorState from "./ErrorState";

export default function DownloaderCard() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<QualityChoice>({ kind: "auto", label: "Best available" });
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<DownloadErrorCode | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [doneUrl, setDoneUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const requestId = useRef(0);

  // Stop polling when the component unmounts (no memory leaks).
  useEffect(() => {
    return () => {
      requestId.current += 1;
      apiDownloader.cancel?.();
    };
  }, []);

  // Maintenance banner: new admissions pause, existing jobs continue.
  useEffect(() => {
    fetch("/api/status")
      .then(async (r) => {
        if (!r.ok) return;
        const b = (await r.json()) as { data?: { maintenance?: boolean } };
        if (b.data?.maintenance) setMaintenance(true);
      })
      .catch(() => undefined);
  }, []);

  function handleChange(next: string): void {
    setUrl(next);
    setResult(null);
    setNotice(null);
    if (status === "error") {
      setStatus("idle");
      setErrorCode(undefined);
      setErrorMessage(undefined);
    }
    const trimmed = next.trim();
    if (!trimmed) {
      setFieldError(null);
      return;
    }
    const v = validateTikTokUrlInput(trimmed);
    setFieldError(v.ok ? null : (v.message ?? "Invalid URL"));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (status === "validating" || status === "queued" || status === "processing") return;
    track("download_button_clicked", { provider: "tiktok" });
    const myRequest = ++requestId.current;
    setResult(null);
    setNotice(null);
    setErrorCode(undefined);
    setErrorMessage(undefined);

    const validation = validateTikTokUrlInput(url);
    if (!validation.ok) {
      setFieldError(validation.message ?? "Invalid URL");
      setStatus("error");
      setErrorCode(validation.errorCode);
      setErrorMessage(validation.message);
      return;
    }
    setFieldError(null);
    track("download_started", { provider: "tiktok" });

    try {
      const media = await apiDownloader.createDownload(
        url,
        (job: DownloadJob) => {
          if (requestId.current !== myRequest) return;
          setStatus(job.status);
          if (job.id && job.id !== "api") setJobId(job.id);
        },
        { format: quality.kind === "auto" ? { kind: "auto" } : quality.kind === "audio" ? { kind: "audio" } : { kind: "video", maxHeight: quality.maxHeight ?? 720 } }
      );
      if (requestId.current !== myRequest) return;
      setDoneUrl(validation.normalizedUrl ?? url.trim());
      setResult(media);
      setStatus("completed");
    } catch (err) {
      if (requestId.current !== myRequest) return;
      const code = (err as { code?: DownloadErrorCode }).code ?? "PROCESSING_FAILED";
      setErrorCode(code);
      // Central catalog only — never render raw server/network text, which
      // may carry resolver, path, or provider internals.
      setErrorMessage(userMessageFor(code));
      setStatus("error");
    }
  }

  function handleReset(): void {
    requestId.current += 1;
    apiDownloader.cancel?.();
    setUrl("");
    setResult(null);
    setJobId(null);
    setStatus("idle");
    setFieldError(null);
    setErrorCode(undefined);
    setErrorMessage(undefined);
  }

  async function handleCancelJob(): Promise<void> {
    if (!jobId) return;
    await fetch(`/api/download/${jobId}/cancel`, { method: "POST" }).catch(() => undefined);
    track("download_canceled", { provider: "tiktok" });
    requestId.current += 1;
    apiDownloader.cancel?.();
    setJobId(null);
    setStatus("idle");
    setNotice("Download canceled. Paste a URL to start again.");
  }

  const busy = status === "validating" || status === "queued" || status === "processing";

  return (
    <div className="space-y-4">
      {maintenance ? (
        <p role="status" className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-center text-sm text-amber-900 dark:text-amber-100">
          Scheduled maintenance is underway — new downloads are paused.
          Jobs already running will continue.
        </p>
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-(--color-border) bg-(--color-surface) p-4 shadow-(--shadow-card) sm:p-6"
      >
        <UrlInput
          id="tiktok-url"
          value={url}
          disabled={busy}
          invalidMessage={fieldError}
          onChange={handleChange}
          onPasteEvent={() => track("paste_url", { provider: "tiktok" })}
        />
        <div className="mt-3">
          <QualitySelector url={url} value={quality} onChange={setQuality} />
        </div>
        <div className="mt-3">
          <DownloadButton status={status} />
        </div>
        {busy && jobId ? (
          <div className="mt-2 text-center">
            <button type="button" onClick={() => void handleCancelJob()}
              className="text-sm font-semibold text-(--color-muted) hover:underline">
              Cancel download
            </button>
          </div>
        ) : null}
        <p className="mt-3 text-center text-xs leading-5 text-(--color-muted)">
          Only download content you have the right to save. No account needed.
        </p>
      </form>

      <ProcessingState status={status} />

      {notice && status === "idle" ? (
        <p role="status" className="rounded-2xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-center text-sm text-(--color-ink-700)">
          {notice}
        </p>
      ) : null}

      {status === "error" ? (
        <ErrorState
          code={errorCode}
          message={errorMessage}
          onRetry={() => {
            setStatus("idle");
            setErrorCode(undefined);
          }}
        />
      ) : null}

      {status === "completed" && result ? (
        <ResultCard result={result} sourceUrl={doneUrl} onReset={handleReset} />
      ) : null}
    </div>
  );
}
