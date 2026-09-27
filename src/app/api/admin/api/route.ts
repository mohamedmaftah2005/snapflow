import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getApiStore } from "@/lib/server";

/** Admin key lookup by owner (metadata only — raw keys never exist server-side). */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_VIEW");
  if ("error" in gate) return gate.error;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ success: true, data: { keys: [], hint: "Pass ?userId= to inspect a user's keys." } });
  }
  const keys = (await getApiStore().listApiKeys(userId)).map((k) => ({
    id: k.id, userId: k.userId, name: k.name, prefix: k.prefix,
    scopes: k.scopes, lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt,
    revokedAt: k.revokedAt, createdAt: k.createdAt,
  }));
  return NextResponse.json({ success: true, data: { keys } });
}
