import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { checkLimit } from "@/lib/rate-limit-redis";
import { readJsonBody } from "@/lib/validation/request";
import { parseFormatRequest, type FormatRequest } from "@/lib/media/formats";
import { getClientIp } from "@/lib/client-ip";
import { isValidIdempotencyKey } from "@/lib/idempotency";
import { getSessionUser } from "@/lib/auth/session";
import { getLimiters } from "@/lib/server";
import { inc } from "@/lib/metrics";
import { createDownloadJob } from "@/lib/downloads/service";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

function withRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("X-Request-Id", requestId);
  return res;
}

/**
 * Async job creation: validate → persist QUEUED → enqueue → return immediately.
 * Heavy yt-dlp work happens in the worker, never in this request.
 * Business logic lives in lib/downloads/service (shared with the v1 API).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const requestId = req.headers.get("X-Request-Id")?.slice(0, 64) || crypto.randomUUID();
  const logCtx = { req: requestId };
  logger.debug("request_received", { ...logCtx, route: "POST /api/download" });
  inc("http_requests_total");

  const ip = getClientIp(req);
  const { maintenanceMode } = await import("@/lib/admin/flags");
  if (await maintenanceMode()) {
    return withRequestId(
      NextResponse.json(
        errBody("TEMPORARILY_UNAVAILABLE", "Service temporarily unavailable. We are performing maintenance. Please try again later."),
        { status: 503, headers: { "Retry-After": "300" } }
      ),
      requestId
    );
  }
  const rl = await checkLimit(getLimiters().create, `dl:${ip}`);
  if (!rl.allowed) {
    inc("rate_limited_total");
    logger.warn("rate_limited", { ...logCtx, route: "create" });
    return withRequestId(
      NextResponse.json(errBody("RATE_LIMITED", "Too many requests. Please try again later."), {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }),
      requestId
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["url", "format"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return withRequestId(NextResponse.json(errBody(e.code, e.userMessage), { status: e.status }), requestId);
  }
  const { url } = body;
  if (typeof url !== "string" || url.trim().length === 0 || url.length > 2048) {
    const e = new AppError("INVALID_URL");
    return withRequestId(NextResponse.json(errBody(e.code, e.userMessage), { status: e.status }), requestId);
  }
  // Requested output is allowlisted server-side; the worker builds fixed args.
  let format: FormatRequest = { kind: "auto" };
  try {
    format = parseFormatRequest(body.format);
  } catch {
    const e = new AppError("BAD_REQUEST", "Invalid format request.");
    return withRequestId(NextResponse.json(errBody(e.code, e.userMessage), { status: e.status }), requestId);
  }
  const { isEnabled: flagOn } = await import("@/lib/admin/flags");
  if (format.kind === "audio" && !(await flagOn("audio_extraction", true))) {
    return withRequestId(NextResponse.json(errBody("BAD_REQUEST", "Audio extraction is currently disabled."), { status: 503 }), requestId);
  }
  if (format.kind === "video" && !(await flagOn("advanced_quality", true))) {
    return withRequestId(NextResponse.json(errBody("BAD_REQUEST", "Quality selection is currently disabled."), { status: 503 }), requestId);
  }

  // Optional idempotency: same key returns the same job instead of
  // spawning duplicate expensive work (e.g. double-click / retry).
  const idemHeader = req.headers.get("Idempotency-Key")?.trim();
  let idemKey: string | undefined;
  if (idemHeader) {
    if (!isValidIdempotencyKey(idemHeader)) {
      const e = new AppError("BAD_REQUEST", "Invalid Idempotency-Key format.");
      return withRequestId(NextResponse.json(errBody(e.code, e.userMessage), { status: e.status }), requestId);
    }
    idemKey = idemHeader;
  }

  const sessionUser = await getSessionUser(req);
  if (!sessionUser && !env.enableGuestDownloads) {
    return withRequestId(
      NextResponse.json(errBody("BAD_REQUEST", "Sign in to download."), { status: 401 }),
      requestId
    );
  }

  const result = await createDownloadJob({
    url, format, user: sessionUser, ip, idempotencyKey: idemKey, requestId,
  });
  if (!result.ok) {
    return withRequestId(
      NextResponse.json(errBody(result.code, result.message), { status: result.status }),
      requestId
    );
  }
  return withRequestId(
    NextResponse.json(
      { success: true, data: { jobId: result.jobId, status: result.status } },
      { status: result.deduplicated ? 200 : 202 }
    ),
    requestId
  );
}
