import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isCrossSiteOrigin } from "@/lib/validation/origin";

/**
 * CSRF edge guard for session-cookie API routes. SameSite=Lax already
 * blocks most cross-site POSTs; this closes the remainder: when the
 * browser supplies Origin/Referer, it must match the request host.
 *
 * Exempt: /api/v1/* (API-key auth for server-to-server clients, which
 * send no Origin) and /api/webhooks/payment (provider-signed).
 * Requests without Origin/Referer (curl, tests, non-browser clients)
 * are allowed — documented in src/lib/validation/origin.ts.
 *
 * NOTE (Next 16): the file convention is proxy.ts with export function
 * proxy (middleware.ts is deprecated and ignored).
 */
export function proxy(req: NextRequest): NextResponse {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return NextResponse.next();
  }
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/v1/") || pathname === "/api/webhooks/payment") {
    return NextResponse.next();
  }
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (isCrossSiteOrigin(req.url, origin, referer)) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Cross-site requests are not allowed." } },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
