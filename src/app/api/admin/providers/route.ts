import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getProviderRegistry } from "@/lib/providers/registry";
import { setFlag } from "@/lib/admin/flags";
import { readJsonBody } from "@/lib/validation/request";
import { getRepository } from "@/lib/server";
import type { ProviderId } from "@/lib/providers/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Provider health: registry status + 7-day success stats. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "PROVIDER_VIEW");
  if ("error" in gate) return gate.error;
  const stats = await getRepository().providerStats(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const byId = new Map(stats.map((s) => [s.provider, s]));
  return NextResponse.json({
    success: true,
    data: {
      providers: getProviderRegistry().all().map((e) => {
        const s = byId.get(e.provider.id);
        const total = s?.total ?? 0;
        const failed = s?.failed ?? 0;
        return {
          id: e.provider.id,
          name: e.provider.name,
          status: e.status,
          capabilities: e.provider.capabilities,
          contentTypes: e.contentTypes,
          jobs7d: total,
          successRate: total > 0 ? Math.round(((total - failed) / total) * 1000) / 10 : null,
          avgMs: s?.avgMs ?? null,
        };
      }),
    },
  });
}

/** Enable/disable/maintenance. New jobs follow the flag; existing jobs are untouched. */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "PROVIDER_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["id", "status", "reason"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const { id, status } = body as { id: unknown; status: unknown };
  if ((id !== "tiktok" && id !== "youtube" && id !== "instagram") || (status !== "enabled" && status !== "disabled" && status !== "maintenance")) {
    return NextResponse.json(errBody("BAD_REQUEST", "Unknown provider or status."), { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 3) {
    return NextResponse.json(errBody("BAD_REQUEST", "A reason (min 3 chars) is required."), { status: 400 });
  }
  const pid = id as ProviderId;
  // Maintenance is orthogonal to enabled/disabled; both are cached flags.
  await setFlag(`provider_${pid}_maintenance`, status === "maintenance", admin.user.id);
  if (status !== "maintenance") {
    await setFlag(`provider_${pid}_enabled`, status === "enabled", admin.user.id);
  }
  // setFlag updates the in-process cache immediately; other instances
  // follow within the flag refresh window (documented).
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role,
    action: status === "enabled" ? "PROVIDER_ENABLED" : status === "disabled" ? "PROVIDER_DISABLED" : "PROVIDER_MAINTENANCE",
    targetType: "provider", targetId: pid, reason, requestId: admin.requestId,
  });
  return NextResponse.json({ success: true, data: { id: pid, status } });
}
