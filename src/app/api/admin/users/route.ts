import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore } from "@/lib/server";

function pageParams(url: string): { limit: number; offset: number; query?: string; plan?: string; status?: string; role?: string } {
  const u = new URL(url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 20) || 20, 1), 50);
  const page = Math.max(Number(u.searchParams.get("page") ?? 1) || 1, 1);
  return {
    limit,
    offset: (page - 1) * limit,
    query: u.searchParams.get("q") ?? undefined,
    plan: u.searchParams.get("plan") ?? undefined,
    status: u.searchParams.get("status") ?? undefined,
    role: u.searchParams.get("role") ?? undefined,
  };
}

/** Paginated user search. No password hashes, no tokens — ever. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_VIEW");
  if ("error" in gate) return gate.error;
  const p = pageParams(req.url);
  const store = getAccountStore();
  const { users, total } = await store.listUsers(p);
  // Attach plan per user (N+1 is fine at page size ≤ 50).
  const { getEntitlement } = await import("@/lib/entitlements");
  const rows = [];
  for (const u of users) {
    let plan = "free";
    try {
      plan = (await getEntitlement(u)).plan.id;
    } catch {
      // entitlement failure must not break the listing
    }
    rows.push({
      id: u.id, email: u.email, name: u.name, status: u.status, role: u.role,
      plan, emailVerified: Boolean(u.emailVerifiedAt), createdAt: u.createdAt,
    });
  }
  const filtered = p.plan ? rows.filter((r) => r.plan === p.plan) : rows;
  return NextResponse.json({
    success: true,
    data: { users: filtered, total: p.plan ? filtered.length : total, limit: p.limit, offset: p.offset },
  });
}
