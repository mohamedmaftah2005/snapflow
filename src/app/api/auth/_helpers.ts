import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { checkLimit } from "@/lib/rate-limit-redis";
import { readJsonBody } from "@/lib/validation/request";
import { getClientIp } from "@/lib/client-ip";
import { getAccountStore, getLimiters } from "@/lib/server";

export function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Shared guard: feature flag, auth rate limit, accounts availability. */
export async function authGuard(req: Request): Promise<NextResponse | null> {
  if (!env.enableAuth) {
    return NextResponse.json(errBody("BAD_REQUEST", "Accounts are disabled."), { status: 503 });
  }
  const rl = await checkLimit(getLimiters().auth, `au:${getClientIp(req)}`);
  if (!rl.allowed) {
    return NextResponse.json(errBody("RATE_LIMITED", "Too many requests. Please try again later."), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }
  try {
    getAccountStore();
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("TEMPORARILY_UNAVAILABLE");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  return null;
}

export async function readAuthBody(req: Request, allowedKeys: string[]): Promise<Record<string, unknown> | NextResponse> {
  try {
    return await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
}
