import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { authenticateApiKey, type KeyAuth } from "@/lib/api/keys";
import type { ApiScope } from "@/lib/api/types";
import { inc } from "@/lib/metrics";
import { logger } from "@/lib/logger";

export function newRequestId(req: Request): string {
  const given = req.headers.get("X-Request-ID") ?? req.headers.get("x-request-id") ?? "";
  if (/^[A-Za-z0-9_-]{8,64}$/.test(given)) return given;
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** v1 envelope: {error:{code,message,request_id}}. Never the internal shape. */
export function v1Error(code: string, message: string, requestId: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { code, message, request_id: requestId } },
    { status, headers: { "X-Request-ID": requestId } }
  );
}

export function v1Ok(data: unknown, requestId: string, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "X-Request-ID": requestId } });
}

/** 429 with Retry-After + rate-limit headers (no infra details). */
export function v1RateLimited(requestId: string, retryAfterMs: number): NextResponse {
  const res = v1Error("RATE_LIMITED", "Too many requests.", requestId, 429);
  res.headers.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  res.headers.set("X-RateLimit-Limit", String(env.apiRateLimitRequests));
  res.headers.set("X-RateLimit-Remaining", "0");
  return res;
}

export interface V1Context extends KeyAuth {
  requestId: string;
}

/**
 * v1 gate: Bearer key → scopes → JSON envelope errors.
 * Logs include key id + user, never the secret.
 */
export async function requireApiKey(
  req: Request,
  scopes: ApiScope[]
): Promise<{ ctx: V1Context } | { error: NextResponse }> {
  const requestId = newRequestId(req);
  const t0 = Date.now();
  const { isEnabled } = await import("@/lib/admin/flags");
  if (!(await isEnabled("api_enabled", true))) {
    return { error: v1Error("SERVICE_UNAVAILABLE", "The public API is temporarily disabled.", requestId, 503) };
  }
  const auth = await authenticateApiKey(req);
  if ("error" in auth) {
    // Generic: never reveal whether a specific key exists.
    logger.warn("api_auth_failed", { req: requestId });
    return { error: v1Error("INVALID_API_KEY", "The API key is invalid or has been revoked.", requestId, 401) };
  }
  for (const s of scopes) {
    if (!auth.scopes.includes(s)) {
      logger.warn("api_scope_denied", { req: requestId, key: auth.keyId, scope: s });
      return { error: v1Error("INSUFFICIENT_SCOPE", `This key lacks the '${s}' scope.`, requestId, 403) };
    }
  }
  inc("api_request_total");
  logger.info("api_request", {
    req: requestId, key: auth.keyId, user: auth.user.id,
    endpoint: new URL(req.url).pathname, method: req.method,
    durationMs: Date.now() - t0,
  });
  return { ctx: { ...auth, requestId } };
}
