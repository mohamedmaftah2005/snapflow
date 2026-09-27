import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore, getRepository } from "@/lib/server";
import { getEntitlement, usageFor } from "@/lib/entitlements";

/** Sanitized user detail for support/operations. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_VIEW");
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const store = getAccountStore();
  const row = await store.getUserById(id);
  if (!row) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
  }
  // Explicit allowlist: password hashes and tokens can never leave this route.
  const user = {
    id: row.id, email: row.email, name: row.name, status: row.status, role: row.role,
    emailVerifiedAt: row.emailVerifiedAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
  const ent = await getEntitlement(user).catch(() => null);
  const usage = ent ? await usageFor(ent, "admin").catch(() => null) : null;
  const sub = await store.getActiveSubscription(id).catch(() => undefined);
  const jobs = await getRepository().listByUser(id, 10);
  return NextResponse.json({
    success: true,
    data: {
      user: { ...user, plan: ent?.plan.id ?? "free", emailVerified: Boolean(user.emailVerifiedAt) },
      subscription: sub
        ? {
            planId: sub.planId, status: sub.status, provider: sub.provider,
            currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      usage,
      recentJobs: jobs.map((j) => ({
        id: j.id, provider: j.provider, status: j.status,
        title: j.title ?? "Media", createdAt: new Date(j.createdAt).toISOString(),
      })),
    },
  });
}
