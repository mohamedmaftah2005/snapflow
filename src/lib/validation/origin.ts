import { NextResponse } from "next/server";

/**
 * Pure same-origin check, unit-testable without Next.js.
 * Returns true when the request must be rejected as cross-site.
 */
export function isCrossSiteOrigin(reqUrl: string, origin: string | null, referer: string | null): boolean {
  if (!origin && !referer) return false;
  let host: string;
  try {
    host = new URL(reqUrl).host.toLowerCase();
  } catch {
    return false;
  }
  const matches = (v: string): boolean => {
    try {
      return new URL(v).host.toLowerCase() === host;
    } catch {
      return false;
    }
  };
  return Boolean((origin && !matches(origin)) || (!origin && referer && !matches(referer)));
}

/**
 * CSRF hardening for session-cookie routes (the public v1 API uses API
 * keys and is intentionally exempt — server-to-server clients send no
 * Origin). SameSite=Lax already blocks most cross-site POSTs; this
 * closes the remainder: if the browser supplies Origin/Referer, it must
 * match the request Host. Absent headers (curl, tests, non-browser
 * clients) are allowed — documented limitation, not a bypass for
 * browsers, which always send Origin on fetch/form POSTs.
 */
export function rejectCrossSite(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!isCrossSiteOrigin(req.url, origin, referer)) return null;
  return NextResponse.json(
    { success: false, error: { code: "BAD_REQUEST", message: "Cross-site requests are not allowed." } },
    { status: 403 }
  );
}
