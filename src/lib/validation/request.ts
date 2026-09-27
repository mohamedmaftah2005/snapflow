import { AppError } from "@/lib/errors";

/**
 * Strict JSON body parsing with an explicit byte cap.
 * Reads the stream manually so an oversized body is rejected
 * before business logic (or a full unbounded buffer) executes.
 */
export async function readJsonBody(
  req: Request,
  opts: { maxBytes: number; allowedKeys: string[] }
): Promise<Record<string, unknown>> {
  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) {
    throw new AppError("BAD_REQUEST", "Content-Type must be application/json.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > opts.maxBytes) {
    throw new AppError("REQUEST_TOO_LARGE");
  }
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("BAD_REQUEST");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > opts.maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new AppError("REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new AppError("BAD_REQUEST", "Malformed JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("BAD_REQUEST");
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0 || !keys.every((k) => opts.allowedKeys.includes(k))) {
    throw new AppError("BAD_REQUEST");
  }
  return body as Record<string, unknown>;
}
