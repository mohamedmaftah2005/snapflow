import fs from "node:fs";
import { NextResponse } from "next/server";
import { getJobStore, isValidFileId } from "@/services/downloader/store";
import { getLimiters, getRepository } from "@/lib/server";
import { checkLimit } from "@/lib/rate-limit-redis";
import { getClientIp } from "@/lib/client-ip";
import { getSessionUser } from "@/lib/auth/session";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Local-driver file delivery. Serves only completed, unexpired jobs by
 * internal ID — never arbitrary paths. (S3 driver uses signed URLs instead.)
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rl = await checkLimit(getLimiters().file, `fl:${getClientIp(req)}`);
  if (!rl.allowed) {
    inc("rate_limited_total");
    return NextResponse.json(errBody("RATE_LIMITED", "Too many requests. Please try again later."), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }
  const { id } = await ctx.params;
  if (!isValidFileId(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid file ID."), { status: 400 });
  }

  // New repository first, Phase-2 legacy store as fallback.
  // ?item=<itemId> selects one artifact of a multi-item job; both IDs are
  // validated, paths always come from the database — never from the request.
  const rec = await getRepository().get(id);
  if (rec?.userId) {
    const viewer = await getSessionUser(req);
    if (!viewer || viewer.id !== rec.userId) {
      return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This file is unavailable."), { status: 404 });
    }
  }
  let filePath: string | undefined;
  let expiresAt = 0;
  let suffix = "mp4";
  if (rec && rec.status === "COMPLETED") {
    const itemParam = new URL(req.url).searchParams.get("item");
    if (itemParam) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(itemParam)) {
        return NextResponse.json(errBody("BAD_REQUEST", "Invalid item ID."), { status: 400 });
      }
      const items = await getRepository().getItems(id);
      const match = items.find((it) => it.id === `${id}-${itemParam}` && it.localPath);
      if (!match?.localPath) {
        return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This file is unavailable."), { status: 404 });
      }
      filePath = match.localPath;
      expiresAt = match.expiresAt;
      suffix = match.container.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    } else if (rec.localPath) {
      filePath = rec.localPath;
      expiresAt = rec.expiresAt;
    }
  }
  if (!filePath) {
    const legacy = getJobStore().get(id);
    if (legacy && legacy.status === "COMPLETED" && legacy.filePath) {
      filePath = legacy.filePath;
      expiresAt = legacy.expiresAt;
    }
  }
  if (!filePath) {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This file is unavailable."), { status: 404 });
  }
  if (Date.now() > expiresAt) {
    await getRepository().update(id, { status: "EXPIRED" });
    log(id, "file expired on access");
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This file has expired."), { status: 410 });
  }

  let stat: { size: number };
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return NextResponse.json(errBody("VIDEO_UNAVAILABLE", "This file is unavailable."), { status: 404 });
  }

  const stream = fs.createReadStream(filePath);
  const safeName = `snapflow-${id}.${suffix}`;
  inc("files_served_total");
  const contentType =
    suffix === "jpg" || suffix === "jpeg"
      ? "image/jpeg"
      : suffix === "png"
        ? "image/png"
        : suffix === "webp"
          ? "image/webp"
          : suffix === "mp3"
            ? "audio/mpeg"
            : "video/mp4";
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
