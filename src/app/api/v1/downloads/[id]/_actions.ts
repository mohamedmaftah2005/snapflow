import { NextResponse } from "next/server";
import { requireApiKey, v1Error, v1Ok } from "../../_auth";
import { getQueue, getRepository } from "@/lib/server";
import { isValidFileId } from "@/services/downloader/store";
import { isRetryableCode } from "@/worker/pipeline";

async function loadOwned(req: Request, id: string, scope: "downloads:cancel" | "downloads:create") {
  const gate = await requireApiKey(req, [scope]);
  if ("error" in gate) return gate;
  const { ctx: c } = gate;
  if (!isValidFileId(id)) {
    return { error: v1Error("INVALID_REQUEST", "Invalid download ID.", c.requestId, 400) };
  }
  const job = await getRepository().get(id);
  if (!job || job.userId !== c.user.id) {
    return { error: v1Error("DOWNLOAD_NOT_FOUND", "Download not found.", c.requestId, 404) };
  }
  return { ctx: c, job };
}

/** POST /api/v1/downloads/:id/cancel */
export async function cancelRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await loadOwned(req, id, "downloads:cancel");
  if ("error" in loaded) return loaded.error;
  const { ctx: c, job } = loaded;
  if (job.status !== "QUEUED" && job.status !== "PENDING" && job.status !== "PROCESSING") {
    return v1Error("INVALID_REQUEST", "Only active downloads can be canceled.", c.requestId, 400);
  }
  await getRepository().update(id, { status: "CANCELED", errorCode: "CANCELED", errorMessage: "Canceled." });
  return v1Ok({ id, status: "CANCELED" }, c.requestId);
}

/** POST /api/v1/downloads/:id/retry — retryable failures only, counts against quota. */
export async function retryRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await loadOwned(req, id, "downloads:create");
  if ("error" in loaded) return loaded.error;
  const { ctx: c, job } = loaded;
  if (job.status !== "FAILED" || !job.errorCode || !isRetryableCode(job.errorCode)) {
    return v1Error("INVALID_REQUEST", "This download cannot be retried.", c.requestId, 400);
  }
  const { getEntitlement, reserveDownload } = await import("@/lib/entitlements");
  const { getAccountStore } = await import("@/lib/server");
  const { toPublicUser } = await import("@/lib/auth/service");
  const row = await getAccountStore().getUserById(c.user.id);
  if (!row) return v1Error("FORBIDDEN", "Account unavailable.", c.requestId, 403);
  const ent = await getEntitlement(toPublicUser(row));
  const { getClientIp } = await import("@/lib/client-ip");
  if (!(await reserveDownload(ent, getClientIp(req)))) {
    return v1Error("QUOTA_EXCEEDED", "Download quota exceeded.", c.requestId, 429);
  }
  await getRepository().update(id, { status: "QUEUED", errorCode: undefined, errorMessage: undefined });
  await getQueue().enqueue({ jobId: id, url: job.sourceUrl, provider: job.provider });
  return v1Ok({ id, status: "QUEUED" }, c.requestId);
}
