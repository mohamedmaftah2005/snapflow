import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore } from "@/lib/server";

/** Read-only audit trail. No update/delete route exists by design. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "AUDIT_VIEW");
  if ("error" in gate) return gate.error;
  const u = new URL(req.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 20) || 20, 1), 50);
  const page = Math.max(Number(u.searchParams.get("page") ?? 1) || 1, 1);
  const { entries, total } = await getAccountStore().listAudit({
    action: u.searchParams.get("action") ?? undefined,
    actor: u.searchParams.get("actor") ?? undefined,
    target: u.searchParams.get("target") ?? undefined,
    limit,
    offset: (page - 1) * limit,
  });
  return NextResponse.json({ success: true, data: { entries, total, limit, page } });
}
