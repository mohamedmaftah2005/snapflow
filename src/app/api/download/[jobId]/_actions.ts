import { NextResponse } from "next/server";
import { isValidFileId } from "@/services/downloader/store";
import { getSessionUser } from "@/lib/auth/session";
import { getQueue, getRepository } from "@/lib/server";
import { isRetryableCode } from "@/worker/pipeline";
import type { DownloadJobRecord } from "@/lib/jobs/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

async function loadOwned(
  req: Request,
  jobId: string
): Promise<{ error: NextResponse } | { job: DownloadJobRecord }> {
  if (!isValidFileId(jobId)) {
    return { error: NextResponse.json(errBody("BAD_REQUEST", "Invalid job ID."), { status: 400 }) };
  }
  const job = await getRepository().get(jobId);
  if (!job) {
    return { error: NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Job not found."), { status: 404 }) };
  }
  if (job.userId) {
    const viewer = await getSessionUser(req);
    if (!viewer || viewer.id !== job.userId) {
      return { error: NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Job not found."), { status: 404 }) };
    }
  }
  return { job };
}

/**
 * Owner (or guest capability-URL holder) cancel. Sets CANCELED; the
 * pipeline's cooperative checks stop in-flight work before upload.
 */
export async function cancelJob(req: Request, jobId: string): Promise<NextResponse> {
  const loaded = await loadOwned(req, jobId);
  if ("error" in loaded) return loaded.error;
  const { job } = loaded;
  if (job.status !== "QUEUED" && job.status !== "PENDING" && job.status !== "PROCESSING") {
    return NextResponse.json(errBody("BAD_REQUEST", "Only active jobs can be canceled."), { status: 400 });
  }
  await getRepository().update(jobId, { status: "CANCELED", errorCode: "CANCELED", errorMessage: "Canceled." });
  const { emitWebhookEvent } = await import("@/lib/webhooks/emit");
  await emitWebhookEvent(job.userId, "download.canceled", { download_id: jobId, status: "CANCELED" }).catch(() => undefined);
  return NextResponse.json({ success: true, data: { status: "CANCELED" } });
}

/** Owner retry: only FAILED + retryable codes; never reruns other states. */
export async function retryJob(req: Request, jobId: string): Promise<NextResponse> {
  const loaded = await loadOwned(req, jobId);
  if ("error" in loaded) return loaded.error;
  const { job } = loaded;
  if (job.status !== "FAILED" || !job.errorCode || !isRetryableCode(job.errorCode)) {
    return NextResponse.json(errBody("BAD_REQUEST", "This job cannot be retried."), { status: 400 });
  }
  await getRepository().update(jobId, { status: "QUEUED", errorCode: undefined, errorMessage: undefined });
  await getQueue().enqueue({ jobId, url: job.sourceUrl, provider: job.provider });
  return NextResponse.json({ success: true, data: { status: "QUEUED" } });
}
