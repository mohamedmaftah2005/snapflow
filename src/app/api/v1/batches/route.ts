import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { createHash } from "node:crypto";
import { requireApiKey, v1Error, v1Ok, v1RateLimited } from "../_auth";
import { checkLimit } from "@/lib/rate-limit-redis";
import { getApiStore, getLimiters } from "@/lib/server";
import { isValidIdempotencyKey } from "@/lib/idempotency";
import { createBatchJob } from "@/lib/batches/service";
import { parseFormatRequest } from "@/lib/media/formats";
import { getClientIp } from "@/lib/client-ip";
import { inc } from "@/lib/metrics";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** POST /api/v1/batches — same batch service as the web UI. */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["batches:create"]);
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const requestId = ctx.requestId;

  const rl = await checkLimit(getLimiters().api, `v1ba:${ctx.keyId}`);
  if (!rl.allowed) return v1RateLimited(requestId, rl.retryAfterMs);

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
  if (!Array.isArray(body.urls)) {
    return v1Error("INVALID_REQUEST", "Provide a urls array.", requestId, 400);
  }
  for (const k of Object.keys(body)) {
    if (k !== "urls" && k !== "format") return v1Error("INVALID_REQUEST", `Unexpected field: ${k}.`, requestId, 400);
  }
  let format;
  try {
    format = parseFormatRequest(body.format);
  } catch {
    return v1Error("INVALID_REQUEST", "Invalid format request.", requestId, 400);
  }

  const idemHeader = req.headers.get("Idempotency-Key")?.trim();
  const store = getApiStore();
  const hash = createHash("sha256").update(rawBody).digest("hex");
  if (idemHeader) {
    if (!isValidIdempotencyKey(idemHeader)) {
      return v1Error("INVALID_REQUEST", "Invalid Idempotency-Key format.", requestId, 400);
    }
    const prior = await store.getIdempotency(ctx.user.id, idemHeader, Date.now());
    if (prior) {
      if (prior.requestHash !== hash) {
        return v1Error("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request.", requestId, 409);
      }
      return v1Ok(prior.response, requestId, prior.statusCode);
    }
  }

  const result = await createBatchJob({
    urls: body.urls as unknown[],
    format,
    user: ctx.user,
    ip: getClientIp(req),
    requestId,
  });
  if (!result.ok) {
    const code =
      result.code === "PLAN_LIMIT_REACHED" ? "QUOTA_EXCEEDED"
      : result.code === "BAD_REQUEST" ? "INVALID_REQUEST"
      : "INTERNAL_ERROR";
    const status = result.code === "PLAN_LIMIT_REACHED" ? 429 : result.status;
    return v1Error(code, result.message, requestId, status);
  }
  const response = {
    id: result.batchId,
    status: result.progress.status,
    total: result.progress.total,
    completed: result.progress.completed,
    failed: result.progress.failed,
    items: result.jobIds.map((jid) => ({ download_id: jid, status_url: `/api/v1/downloads/${jid}` })),
  };
  if (idemHeader) {
    await store.saveIdempotency({
      key: idemHeader, userId: ctx.user.id, apiKeyId: ctx.keyId,
      requestHash: hash, response, statusCode: 202, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
  }
  inc("api_batch_created_total");
  return v1Ok(response, requestId, 202);
}
