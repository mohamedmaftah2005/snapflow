import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { requirePermission } from "@/lib/admin/guard";
import { checkBinaryAvailable } from "@/services/downloader/ytdlp";

/** Real checks only: DB, Redis, queue, binaries, storage config. No secrets. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "SYSTEM_VIEW");
  if ("error" in gate) return gate.error;
  const services: Record<string, { state: string; detail?: string }> = {};
  const { getRepository, getStorage } = await import("@/lib/server");

  try {
    await getRepository().countByStatus();
    services.database = { state: "HEALTHY" };
  } catch (err) {
    // Detail stays server-side: DB/Redis errors can name hosts/tables.
    console.error(JSON.stringify({ event: "system_check_failed", service: "database", message: String(err).slice(0, 200) }));
    services.database = { state: "DOWN" };
  }

  if (env.queueDriver === "bullmq" && env.redisUrl) {
    try {
      const { getRedisConnection } = await import("@/lib/queue/redis");
      const pong = await getRedisConnection(env.redisUrl).ping();
      services.redis = { state: pong === "PONG" ? "HEALTHY" : "DEGRADED" };
    } catch (err) {
      console.error(JSON.stringify({ event: "system_check_failed", service: "redis", message: String(err).slice(0, 200) }));
      services.redis = { state: "DOWN" };
    }
  } else {
    services.redis = { state: "HEALTHY", detail: "local driver (no Redis required)" };
  }

  try {
    const byStatus = await getRepository().countByStatus();
    const depth = (byStatus.QUEUED ?? 0) + (byStatus.PROCESSING ?? 0) + (byStatus.UPLOADING ?? 0);
    services.queue = { state: depth > env.maxQueueSize ? "DEGRADED" : "HEALTHY", detail: `depth ${depth}` };
  } catch {
    services.queue = { state: "UNKNOWN" };
  }

  const ytdlp = await checkBinaryAvailable(env.ytDlpPath);
  services.workerBinaries = { state: ytdlp ? "HEALTHY" : "DEGRADED", detail: "yt-dlp on web host (worker authoritative)" };
  try {
    const { readHeartbeats, beatInfo } = await import("@/lib/worker/heartbeat");
    const beats = await readHeartbeats();
    const info = beatInfo();
    services.workers = beats.length > 0
      ? { state: "HEALTHY", detail: `${beats.length} live (app v${info.version})` }
      : { state: "UNKNOWN", detail: "no heartbeat in 90s" };
  } catch {
    services.workers = { state: "UNKNOWN" };
  }
  services.storage = { state: "HEALTHY", detail: `driver ${getStorage().kind}` };
  const overall = Object.values(services).every((s) => s.state === "HEALTHY") ? "HEALTHY" : "DEGRADED";
  return NextResponse.json({ success: true, data: { overall, services } });
}
