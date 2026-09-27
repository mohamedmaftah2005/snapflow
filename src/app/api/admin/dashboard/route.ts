import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore, getRepository } from "@/lib/server";
import { cached } from "@/lib/cache";
import { env } from "@/lib/config/env";

/** Operational KPIs answering "is the service healthy right now?" */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "ADMIN_VIEW");
  if ("error" in gate) return gate.error;
  const repo = getRepository();
  const accounts = getAccountStore();
  const now = Date.now();
  const day = now - 24 * 60 * 60 * 1000;
  const week = now - 7 * 24 * 60 * 60 * 1000;
  // Cached aggregate: 7 parallel counts per load don't scale with table
  // size. `cachedAt` lets the UI show staleness honestly.
  const { value, cachedAt } = await cached("admin:dashboard", env.adminStatsTtlMs, async () => {
    const [byStatus, today, thisWeek, users, newUsers, providers, errors] = await Promise.all([
      repo.countByStatus(),
      repo.countSince(day),
      repo.countSince(week),
      accounts.countUsers(),
      accounts.countUsers(day),
      repo.providerStats(week),
      repo.errorBreakdown(week, 10),
    ]);
    const completed = byStatus.COMPLETED ?? 0;
    const failed = byStatus.FAILED ?? 0;
    const done = completed + failed;
    return {
      users: { total: users, new24h: newUsers },
      jobs: {
        today,
        thisWeek,
        byStatus,
        successRate: done > 0 ? Math.round((completed / done) * 1000) / 10 : null,
      },
      providers,
      topErrors: errors,
    };
  });
  return NextResponse.json({ success: true, data: { ...value, cachedAt } });
}
