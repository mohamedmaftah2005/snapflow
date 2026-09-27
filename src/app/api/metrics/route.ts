import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { timingSafeEqual } from "node:crypto";
import { renderPrometheus } from "@/lib/metrics";

/**
 * Internal metrics (Prometheus format). Token-gated: without a matching
 * METRICS_TOKEN this endpoint 404s (does not leak its own existence).
 * Never exposed publicly — scrape from inside the private network only.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const configured = env.metricsToken;
  if (!configured) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(configured);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  return new NextResponse(renderPrometheus(), {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4", "Cache-Control": "no-store" },
  });
}
