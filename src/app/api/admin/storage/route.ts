import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getRepository, getStorage } from "@/lib/server";
import { expireJobs } from "@/worker/cleanup";

/** Storage overview: counts from job/item state. No file browser. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "SYSTEM_VIEW");
  if ("error" in gate) return gate.error;
  const repo = getRepository();
  const now = Date.now();
  const [byStatus, expired, items] = await Promise.all([
    repo.countByStatus(),
    repo.findExpired(now, 1000),
    (async () => {
      // Approximate active files via completed jobs (exact per-object listing
      // would require storage enumeration, which S3 drivers avoid).
      const all = await repo.listJobs({ status: "COMPLETED", limit: 1000, offset: 0 });
      return all.total;
    })(),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      driver: getStorage().kind,
      activeFilesApprox: items,
      expiredPending: expired.length,
      failed: byStatus.FAILED ?? 0,
    },
  });
}

/** Run the idempotent expiry sweep on demand. */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "QUEUE_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  const repo = getRepository();
  const result = await expireJobs(repo, getStorage(), Date.now(), 100);
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role, action: "STORAGE_CLEANUP_STARTED",
    targetType: "storage", targetId: "objects", requestId: admin.requestId,
  });
  return NextResponse.json({ success: true, data: result });
}
