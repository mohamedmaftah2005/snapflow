import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getApiStore } from "@/lib/server";
import { inc } from "@/lib/metrics";
import { logger } from "@/lib/logger";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Revoke a key. Immediate: the next authenticated request fails. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid key ID."), { status: 400 });
  }
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage API keys."), { status: 401 });
  }
  const ok = await getApiStore().revokeApiKey(user.id, id);
  if (!ok) {
    return NextResponse.json(errBody("BAD_REQUEST", "Key not found or already revoked."), { status: 404 });
  }
  logger.info("api_key_revoked", { user: user.id, key: id });
  inc("api_key_revoked_total");
  return NextResponse.json({ success: true, data: {} });
}
