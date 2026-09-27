import { AuthService, SESSION_COOKIE } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import type { UserRecord } from "@/lib/accounts/types";

export function getSessionToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=").trim() || null;
  }
  return null;
}

/** Returns the active user or null. Never throws for missing/invalid sessions. */
export async function getSessionUser(req: Request): Promise<UserRecord | null> {
  try {
    const token = getSessionToken(req);
    if (!token) return null;
    return new AuthService(getAccountStore()).userForToken(token);
  } catch {
    return null;
  }
}
