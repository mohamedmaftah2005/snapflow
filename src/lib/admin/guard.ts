import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/admin/permissions";
import { getClientIp } from "@/lib/client-ip";
import { checkLimit } from "@/lib/rate-limit-redis";
import { getLimiters } from "@/lib/server";
import type { UserRecord } from "@/lib/accounts/types";

export interface AdminContext {
  user: UserRecord;
  requestId: string;
}

function denied(requestId: string, status: 401 | 403): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN",
        message: status === 401 ? "Sign in to continue." : "You don't have access.",
      },
    },
    { status, headers: { "X-Request-Id": requestId } }
  );
}

/**
 * Central gate for every /api/admin/* endpoint. Never rely on UI hiding.
 * Returns the admin context or an error response (401/403, same shape).
 */
export async function requirePermission(
  req: Request,
  perm: Permission
): Promise<{ ctx: AdminContext } | { error: NextResponse }> {
  const requestId = req.headers.get("X-Request-Id")?.slice(0, 64) || crypto.randomUUID();
  const rl = await checkLimit(getLimiters().admin, `ad:${getClientIp(req)}`);
  if (!rl.allowed) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
        { status: 429, headers: { "X-Request-Id": requestId } }
      ) as NextResponse,
    };
  }
  const user = await getSessionUser(req);
  if (!user) return { error: denied(requestId, 401) };
  if (user.status !== "ACTIVE") return { error: denied(requestId, 403) };
  if (!hasPermission(user.role, perm)) return { error: denied(requestId, 403) };
  return { ctx: { user, requestId } };
}
