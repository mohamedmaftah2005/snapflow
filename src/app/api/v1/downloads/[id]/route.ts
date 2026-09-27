import { NextResponse } from "next/server";
import { requireApiKey, v1Error, v1Ok } from "../../_auth";
import { getRepository, getStorage } from "@/lib/server";
import { isValidFileId } from "@/services/downloader/store";

/** GET /api/v1/downloads/:id — owner-scoped normalized result. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["downloads:read"]);
  if ("error" in gate) return gate.error;
  const { ctx: c } = gate;
  const { id } = await ctx.params;
  if (!isValidFileId(id)) {
    return v1Error("INVALID_REQUEST", "Invalid download ID.", c.requestId, 400);
  }
  const job = await getRepository().get(id);
  if (!job || job.userId !== c.user.id) {
    return v1Error("DOWNLOAD_NOT_FOUND", "Download not found.", c.requestId, 404);
  }
  const base = {
    id: job.id,
    status: job.status,
    provider: job.provider,
    created_at: new Date(job.createdAt).toISOString(),
    status_url: `/api/v1/downloads/${job.id}`,
  };
  if (job.status !== "COMPLETED") {
    return v1Ok(base, c.requestId);
  }
  const items = await getRepository().getItems(id);
  const storage = getStorage();
  const downloads = [];
  for (const it of items.length > 0 ? items : []) {
    downloads.push({
      type: it.type.toLowerCase(),
      format: it.format,
      size: it.fileSize ?? null,
      url: storage.kind === "s3" && it.fileKey ? await storage.getSignedUrl(it.fileKey) : undefined,
      expires_at: new Date(it.expiresAt).toISOString(),
    });
  }
  const first = downloads[0];
  const available = Boolean(first?.url) || storage.kind === "local";
  return v1Ok(
    {
      ...base,
      media: {
        type: (job.mediaType ?? "VIDEO").toLowerCase(),
        title: job.title ?? null,
        duration: job.duration ?? null,
        size: job.fileSize ?? null,
      },
      download: {
        available,
        // Local driver serves via the web app; S3 via signed URLs.
        url: first?.url ?? (storage.kind === "local" ? `/api/files/${job.id}${items.length > 0 ? `?item=${items[0]?.id.split("-").slice(-1)[0]}` : ""}` : null),
        expires_at: job.expiresAt ? new Date(job.expiresAt).toISOString() : null,
      },
    },
    c.requestId
  );
}
