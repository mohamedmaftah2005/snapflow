import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { checkLimit } from "@/lib/rate-limit-redis";
import { readJsonBody } from "@/lib/validation/request";
import { parseFormatRequest } from "@/lib/media/formats";
import { getClientIp } from "@/lib/client-ip";
import { getSessionUser } from "@/lib/auth/session";
import { getLimiters } from "@/lib/server";
import { createBatchJob } from "@/lib/batches/service";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Batch creation: validates every URL individually, enforces plan batch
 * limits AND the absolute cap, reserves N usage units, then creates one
 * normal (already-authorized) job per valid URL. One bad URL never fails
 * the whole batch — per-item errors are returned alongside created jobs.
 * Business logic lives in lib/batches/service (shared with the v1 API).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { isEnabled } = await import("@/lib/admin/flags");
  if (!(await isEnabled("batch_downloads", true))) {
    return NextResponse.json(errBody("BAD_REQUEST", "Batch downloads are currently disabled."), { status: 503 });
  }
  const ip = getClientIp(req);
  const rl = await checkLimit(getLimiters().batch, `ba:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(errBody("RATE_LIMITED", "Too many requests. Please try again later."), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["urls", "format"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  let format: { kind: "auto" } | { kind: "video"; maxHeight: number } | { kind: "audio" } = { kind: "auto" };
  try {
    format = parseFormatRequest(body.format);
  } catch {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid format request."), { status: 400 });
  }
  if (format.kind === "audio") {
    if (!(await isEnabled("audio_extraction", true))) {
      return NextResponse.json(errBody("BAD_REQUEST", "Audio extraction is currently disabled."), { status: 503 });
    }
  } else if (format.kind === "video") {
    if (!(await isEnabled("advanced_quality", true))) {
      return NextResponse.json(errBody("BAD_REQUEST", "Quality selection is currently disabled."), { status: 503 });
    }
  }

  const sessionUser = await getSessionUser(req);
  const result = await createBatchJob({
    urls: body.urls as unknown[],
    format,
    user: sessionUser,
    ip,
    requestId,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: { code: result.code, message: result.message },
        ...(result.itemErrors ? { itemErrors: result.itemErrors } : {}),
      },
      { status: result.status }
    );
  }
  return NextResponse.json(
    {
      success: true,
      data: {
        batchId: result.batchId,
        ...result.progress,
        jobIds: result.jobIds,
        itemErrors: result.itemErrors ?? undefined,
      },
    },
    { status: 202 }
  );
}
