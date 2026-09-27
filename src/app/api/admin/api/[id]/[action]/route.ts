import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getApiStore } from "@/lib/server";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** API overview: key inventory (metadata only) + webhook health. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "SYSTEM_VIEW");
  if ("error" in gate) return gate.error;
  const u = new URL(req.url);
  const userId = u.searchParams.get("userId") ?? undefined;
  const store = getApiStore();
  // Key metadata for a user (admin view). Raw values are never retrievable.
  const keys = userId
    ? (await store.listApiKeys(userId)).map((k) => ({
        id: k.id, userId: k.userId, name: k.name, prefix: k.prefix,
        scopes: k.scopes, lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt,
        revokedAt: k.revokedAt, createdAt: k.createdAt,
      }))
    : [];
  return NextResponse.json({ success: true, data: { keys } });
}

/** Revoke any user's key (audited). The raw value was never stored. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  const { id, action } = await ctx.params;
  if (action !== "revoke") {
    return NextResponse.json(errBody("BAD_REQUEST", "Unknown action."), { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    // no body required
  }
  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId || !/^[A-Za-z0-9_-]{8,64}$/.test(userId)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Provide the key owner's userId."), { status: 400 });
  }
  const ok = await getApiStore().revokeApiKey(userId, id);
  if (!ok) {
    return NextResponse.json(errBody("BAD_REQUEST", "Key not found or already revoked."), { status: 404 });
  }
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role, action: "API_KEY_REVOKED",
    targetType: "api_key", targetId: id, reason: "admin revocation", requestId: admin.requestId,
  });
  return NextResponse.json({ success: true, data: {} });
}
