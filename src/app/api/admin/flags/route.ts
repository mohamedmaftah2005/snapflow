import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { FLAG_DEFS, listFlagsWithDefaults, setFlag } from "@/lib/admin/flags";
import { readJsonBody } from "@/lib/validation/request";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "ADMIN_VIEW");
  if ("error" in gate) return gate.error;
  return NextResponse.json({ success: true, data: { flags: await listFlagsWithDefaults(FLAG_DEFS) } });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "FLAG_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["key", "enabled", "reason"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const known = FLAG_DEFS.some((d) => d.key === body.key);
  if (!known || typeof body.enabled !== "boolean") {
    return NextResponse.json(errBody("BAD_REQUEST", "Unknown flag or invalid value."), { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 3) {
    return NextResponse.json(errBody("BAD_REQUEST", "A reason (min 3 chars) is required."), { status: 400 });
  }
  const key = body.key as string;
  await setFlag(key, body.enabled as boolean, admin.user.id);
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role,
    action: key === "maintenance_mode"
      ? ((body.enabled as boolean) ? "MAINTENANCE_ENABLED" : "MAINTENANCE_DISABLED")
      : "FLAG_CHANGED",
    targetType: "flag", targetId: key, reason,
    metadata: { enabled: body.enabled },
    requestId: admin.requestId,
  });
  return NextResponse.json({ success: true, data: { key, enabled: body.enabled } });
}
