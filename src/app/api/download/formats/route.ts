import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { checkLimit } from "@/lib/rate-limit-redis";
import { readJsonBody } from "@/lib/validation/request";
import { getProviderRegistry } from "@/lib/providers/registry";
import { normalizeFormats, type MediaFormat } from "@/lib/media/formats";
import { fetchRawMetadata } from "@/lib/providers/ytdlp";
import { getLimiters } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

// 10-minute cache: one metadata fetch per URL, not per keystroke.
const cache = new Map<string, { formats: MediaFormat[]; exp: number }>();

/**
 * Real available formats for a URL (heights that exist + audio if present).
 * Never invents 1080p/4K the source doesn't provide.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rl = await checkLimit(getLimiters().create, "formats:global");
  if (!rl.allowed) {
    return NextResponse.json(errBody("RATE_LIMITED", "Too many requests. Please try again later."), { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["url"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.url !== "string" || !body.url.trim() || body.url.length > 2048) {
    const e = new AppError("INVALID_URL");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const provider = getProviderRegistry().resolve(body.url);
  if (!provider) {
    let parseable = true;
    try {
      new URL((body.url as string).trim());
    } catch {
      parseable = false;
    }
    if (!parseable) {
      const e = new AppError("INVALID_URL");
      return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
    }
    return NextResponse.json(errBody("UNSUPPORTED_URL", "This link isn't supported yet."), { status: 422 });
  }
  let normalized: string;
  try {
    normalized = await provider.validateUrl(body.url);
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("INVALID_URL");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const key = createHash("sha256").update(`formats:${normalized}`).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) {
    return NextResponse.json({ success: true, data: { provider: provider.id, formats: hit.formats, cached: true } });
  }
  try {
    const raw = await fetchRawMetadata(normalized, "formats");
    const formats = normalizeFormats(raw);
    if (cache.size > 500) cache.clear();
    cache.set(key, { formats, exp: Date.now() + 10 * 60 * 1000 });
    return NextResponse.json({ success: true, data: { provider: provider.id, formats } });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("PROCESSING_FAILED");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
}
