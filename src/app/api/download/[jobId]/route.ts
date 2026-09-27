import { NextResponse } from "next/server";
import { isValidFileId } from "@/services/downloader/store";
import { getAccountStore, getLimiters, getRepository, getStorage } from "@/lib/server";
import { checkLimit } from "@/lib/rate-limit-redis";
import { getClientIp } from "@/lib/client-ip";
import { getSessionUser } from "@/lib/auth/session";
import { statusFor } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Polling endpoint: QUEUED → PROCESSING → UPLOADING → COMPLETED / FAILED / EXPIRED. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  inc("status_polls_total");
  const ip = getClientIp(req);
  const rl = await checkLimit(getLimiters().status, `st:${ip}`);
  if (!rl.allowed) {
    inc("rate_limited_total");
    const res = NextResponse.json(errBody("RATE_LIMITED", "Too many requests. Please try again later."), {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        "Cache-Control": "private, no-store",
      },
    });
    res.headers.set("X-Request-Id", requestId);
    return res;
  }

  const { jobId } = await ctx.params;
  if (!isValidFileId(jobId)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid job ID."), {
      status: 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const repo = getRepository();
  const job = await repo.get(jobId);
  if (!job) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Job not found."), {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  // Ownership: jobs created by signed-in users are visible only to their
  // owner (404 otherwise — no enumeration oracle). Guest jobs keep the
  // existing capability-URL behavior.
  let viewerId: string | null = null;
  if (job.userId) {
    const viewer = await getSessionUser(req);
    if (!viewer || viewer.id !== job.userId) {
      return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "Job not found."), {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    viewerId = viewer.id;
  }

  const noStore = { "Cache-Control": "private, no-store" } as const;
  // Bookmark flag rides along so detail views skip the ?limit=50 scan.
  const saved = viewerId
    ? await getAccountStore().isSaved(viewerId, jobId).catch(() => false)
    : false;
  switch (job.status) {
    case "PENDING":
    case "QUEUED":
    case "PROCESSING":
    case "UPLOADING":
      return NextResponse.json(
        { success: true, data: { jobId, status: job.status, provider: job.provider, saved } },
        { headers: noStore }
      );
    case "FAILED":
      logger.info("job_status_failed", { req: requestId, job: jobId });
      return NextResponse.json(
        errBody(job.errorCode ?? "PROCESSING_FAILED", job.errorMessage ?? "The media could not be processed."),
        { status: statusFor((job.errorCode as "PROCESSING_FAILED") ?? "PROCESSING_FAILED"), headers: noStore }
      );
    case "EXPIRED":
      return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This download has expired. Start a new download."), {
        status: 410,
        headers: noStore,
      });
    case "CANCELED":
      return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This download was canceled."), {
        status: 410,
        headers: noStore,
      });
    case "COMPLETED": {
      const storage = getStorage();
      const items = await repo.getItems(jobId);
      // Legacy single-file jobs (pre-items) fall back to the job row.
      const effective =
        items.length > 0
          ? items.map((it) => ({
              id: it.id,
              type: it.type,
              format: it.format,
              container: it.container,
              resolution: it.resolution,
              fileKey: it.fileKey,
              fileSize: it.fileSize,
            }))
          : job.fileKey || job.localPath
            ? [
                {
                  id: `${jobId}-video`,
                  type: "VIDEO" as const,
                  format: job.format ?? "MP4",
                  container: "mp4",
                  resolution: job.resolution,
                  fileKey: job.fileKey ?? "",
                  fileSize: job.fileSize,
                },
              ]
            : [];
      if (effective.length === 0) {
        return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This file is unavailable."), {
          status: 404,
          headers: noStore,
        });
      }
      const itemIdOf = (id: string): string => id.split("-").slice(-1)[0] ?? id;
      const downloads = [];
      for (const it of effective) {
        const url =
          storage.kind === "s3" && it.fileKey
            ? await storage.getSignedUrl(it.fileKey)
            : items.length > 0
              ? `/api/files/${jobId}?item=${encodeURIComponent(itemIdOf(it.id))}`
              : `/api/files/${jobId}`;
        downloads.push({
          id: it.id,
          label: it.type === "VIDEO" ? "Video" : it.type.charAt(0) + it.type.slice(1).toLowerCase(),
          format: it.format,
          container: it.container,
          resolution: it.resolution,
          filesize: it.fileSize,
          url,
        });
      }
      return NextResponse.json(
        {
          success: true,
          data: {
            jobId,
            status: "COMPLETED",
            saved,
            media: {
              provider: job.provider,
              mediaType: job.mediaType ?? "VIDEO",
              title: job.title ?? "Media",
              thumbnail: job.thumbnail,
              duration: job.duration,
              downloads,
            },
          },
        },
        { headers: noStore }
      );
    }
  }
}
