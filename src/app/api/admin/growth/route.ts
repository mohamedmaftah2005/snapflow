import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore, getGrowthStore, getRepository } from "@/lib/server";
import { cached } from "@/lib/cache";
import { env } from "@/lib/config/env";

/** Growth funnel from measured state only — never invented numbers. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "ADMIN_VIEW");
  if ("error" in gate) return gate.error;
  // Cached: the funnel scans up to 1000 users + 200 activation probes per
  // compute. `cachedAt` marks staleness; TTL is ADMIN_STATS_TTL_MS.
  const { value, cachedAt } = await cached("admin:growth", env.adminStatsTtlMs, async () => {
    const accounts = getAccountStore();
    const growth = getGrowthStore();
    const repo = getRepository();
    const now = Date.now();
    const week = now - 7 * 24 * 60 * 60 * 1000;

    const { users: recentUsers } = await accounts.listUsers({ limit: 1000, offset: 0 });
    const signups7d = recentUsers.filter((u) => u.createdAt >= week).length;
    const verified7d = recentUsers.filter((u) => u.createdAt >= week && u.emailVerifiedAt).length;

    // Activation: users with ≥1 completed job (bounded scan over recent users).
    // Batched fetch: one query instead of up to 200 sequential reads.
    const candidates = recentUsers.filter((u) => u.createdAt >= week).slice(0, 200);
    let activated7d = 0;
    for (let i = 0; i < candidates.length; i += 25) {
      const chunk = candidates.slice(i, i + 25);
      const lists = await Promise.all(chunk.map((u) => repo.listByUser(u.id, 5)));
      for (const jobs of lists) {
        if (jobs.some((j) => j.status === "COMPLETED")) activated7d += 1;
      }
    }
    const byStatus = await repo.countByStatus();
    const affiliates = await growth.listAffiliates();
    const campaigns = await growth.listCampaigns();
    return {
      funnel: {
        signups7d,
        verified7d,
        activated7d,
        completedJobs: byStatus.COMPLETED ?? 0,
        failedJobs: byStatus.FAILED ?? 0,
      },
      affiliates: {
        total: affiliates.length,
        active: affiliates.filter((a) => a.status === "ACTIVE").length,
        pending: affiliates.filter((a) => a.status === "PENDING").length,
      },
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter((c) => c.status === "ACTIVE").length,
        sent: campaigns.reduce((a, c) => a + c.sentCount, 0),
      },
    };
  });
  return NextResponse.json({ success: true, data: { ...value, cachedAt } });
}
