import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getQueue } from "@/lib/server";

async function counts(): Promise<{ waiting: number; active: number; failed: number; delayed: number; paused: boolean }> {
  if (env.queueDriver === "bullmq" && env.redisUrl) {
    const { Queue } = await import("bullmq");
    const { getRedisConnection } = await import("@/lib/queue/redis");
    const { DOWNLOAD_QUEUE_NAME } = await import("@/lib/queue/types");
    const q = new Queue(DOWNLOAD_QUEUE_NAME, { connection: getRedisConnection(env.redisUrl) });
    try {
      const c = await q.getJobCounts("waiting", "active", "failed", "delayed");
      const paused = await q.isPaused();
      return {
        waiting: c.waiting ?? 0, active: c.active ?? 0, failed: c.failed ?? 0,
        delayed: c.delayed ?? 0, paused,
      };
    } finally {
      await q.close();
    }
  }
  // Local driver: derive from the job repository (same-process view).
  const { getRepository } = await import("@/lib/server");
  const byStatus = await getRepository().countByStatus();
  return {
    waiting: (byStatus.QUEUED ?? 0) + (byStatus.PENDING ?? 0),
    active: (byStatus.PROCESSING ?? 0) + (byStatus.UPLOADING ?? 0),
    failed: byStatus.FAILED ?? 0,
    delayed: 0,
    paused: false,
  };
}

/** Queue depth + worker liveness signals. No arbitrary Redis commands. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "QUEUE_VIEW");
  if ("error" in gate) return gate.error;
  return NextResponse.json({
    success: true,
    data: { name: "downloadQueue", driver: env.queueDriver, ...(await counts()) },
  });
}

/** Pause/resume are BullMQ-only; the local driver reports unsupported. */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "QUEUE_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  const action = new URL(req.url).searchParams.get("action");
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ success: false, error: { code: "BAD_REQUEST", message: "Use ?action=pause|resume." } }, { status: 400 });
  }
  if (env.queueDriver !== "bullmq" || !env.redisUrl) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Pause/resume needs the BullMQ driver." } },
      { status: 400 }
    );
  }
  const { Queue } = await import("bullmq");
  const { getRedisConnection } = await import("@/lib/queue/redis");
  const { DOWNLOAD_QUEUE_NAME } = await import("@/lib/queue/types");
  const q = new Queue(DOWNLOAD_QUEUE_NAME, { connection: getRedisConnection(env.redisUrl) });
  try {
    if (action === "pause") await q.pause();
    else await q.resume();
  } finally {
    await q.close();
  }
  void getQueue;
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role,
    action: action === "pause" ? "QUEUE_PAUSED" : "QUEUE_RESUMED",
    targetType: "queue", targetId: "downloadQueue",
    reason: "operator action", requestId: admin.requestId,
  });
  return NextResponse.json({ success: true, data: { paused: action === "pause" } });
}
