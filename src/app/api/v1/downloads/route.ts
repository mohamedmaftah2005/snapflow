import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { createHash } from "node:crypto";
import { requireApiKey, v1Error, v1Ok, v1RateLimited } from "../_auth";
import { parseFormatRequest } from "@/lib/media/formats";
import { checkLimit } from "@/lib/rate-limit-redis";
import { getLimiters, getApiStore } from "@/lib/server";
import { getClientIp } from "@/lib/client-ip";
import { createDownloadJob } from "@/lib/downloads/service";
import { isValidIdempotencyKey } from "@/lib/idempotency";
import { inc } from "@/lib/metrics";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * POST /api/v1/downloads — same DownloadService as the web UI.
 * Quotas enforced by the entitlement layer; key-scoped rate limits here.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["downloads:create"]);
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const requestId = ctx.requestId;

  const rl = await checkLimit(getLimiters().api, `v1dl:${ctx.keyId}`);
  if (!rl.allowed) {
    return v1RateLimited(requestId, rl.retryAfterMs);
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || rawBody.length > env.maxRequestBodyBytes) {
    return v1Error("INVALID_REQUEST", "Invalid or oversized request body.", requestId, 400);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return v1Error("INVALID_REQUEST", "Malformed JSON.", requestId, 400);
  }
  if (typeof body.url !== "string" || !body.url.trim() || body.url.length > 2048) {
    return v1Error("INVALID_URL", "Provide a valid url string.", requestId, 400);
  }
  const allowed = new Set(["url", "format"]);
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) return v1Error("INVALID_REQUEST", `Unexpected field: ${k}.`, requestId, 400);
  }
  let format;
  try {
    format = parseFormatRequest(body.format);
  } catch {
    return v1Error("INVALID_REQUEST", "Invalid format request.", requestId, 400);
  }

  // v1 idempotency ledger: same key + same body → original response;
  // same key + different body → 409 conflict.
  const idemHeader = req.headers.get("Idempotency-Key")?.trim();
  const store = getApiStore();
  if (idemHeader) {
    if (!isValidIdempotencyKey(idemHeader)) {
      return v1Error("INVALID_REQUEST", "Invalid Idempotency-Key format.", requestId, 400);
    }
    const prior = await store.getIdempotency(ctx.user.id, idemHeader, Date.now());
    if (prior) {
      if (prior.requestHash !== bodyHash(rawBody)) {
        return v1Error("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request.", requestId, 409);
      }
      return v1Ok(prior.response, requestId, prior.statusCode);
    }
  }

  const result = await createDownloadJob({
    url: body.url,
    format,
    user: ctx.user,
    ip: getClientIp(req),
    requestId,
  });
  if (!result.ok) {
    const code =
      result.code === "INVALID_URL" ? "INVALID_URL"
      : result.code === "UNSUPPORTED_URL" ? "UNSUPPORTED_PROVIDER"
      : result.code === "PLAN_LIMIT_REACHED" ? "QUOTA_EXCEEDED"
      : result.code === "RATE_LIMITED" ? "RATE_LIMITED"
      : "INTERNAL_ERROR";
    const status =
      result.code === "INVALID_URL" ? 400
      : result.code === "UNSUPPORTED_URL" ? 422
      : result.code === "PLAN_LIMIT_REACHED" ? 429
      : result.status;
    return v1Error(code, result.message, requestId, status);
  }

  const response = {
    id: result.jobId,
    status: result.status,
    status_url: `/api/v1/downloads/${result.jobId}`,
  };
  if (idemHeader) {
    await store.saveIdempotency({
      key: idemHeader,
      userId: ctx.user.id,
      apiKeyId: ctx.keyId,
      requestHash: bodyHash(rawBody),
      response,
      statusCode: 202,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
  }
  inc("api_download_created_total");
  return v1Ok(response, requestId, 202);
}
