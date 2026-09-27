import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore, getRepository } from "@/lib/server";

/**
 * Abuse signals (aggregated, no invasive surveillance):
 * suspended accounts, top failure codes, rate-limit pressure.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "ABUSE_VIEW");
  if ("error" in gate) return gate.error;
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [suspended, errors, failed] = await Promise.all([
    getAccountStore().listUsers({ status: "SUSPENDED", limit: 20, offset: 0 }),
    getRepository().errorBreakdown(week, 10),
    getRepository().listJobs({ status: "FAILED", limit: 10, offset: 0 }),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      suspendedUsers: suspended.users.map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt })),
      suspendedTotal: suspended.total,
      topFailureCodes: errors,
      recentFailedJobs: failed.jobs.map((j) => ({
        id: j.id, provider: j.provider, errorCode: j.errorCode, createdAt: j.createdAt,
      })),
    },
  });
}
