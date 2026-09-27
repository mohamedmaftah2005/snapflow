import { env } from "@/lib/config/env";

/**
 * Deployment assumption (documented in docs/runbook):
 * X-Forwarded-For is honored ONLY when TRUST_PROXY=true, i.e. the app runs
 * behind a known, trusted reverse proxy that sanitizes the header.
 * Otherwise the header is untrusted (spoofable) and ignored.
 */
export function getClientIp(req: Request): string {
  if (env.trustProxy) {
    const fwd = req.headers.get("x-forwarded-for");
    const first = fwd?.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return "direct";
}
