import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getGrowthStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { createCampaign, runCampaign } from "@/lib/growth/campaigns";
import type { AuditAction } from "@/lib/admin/audit";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "ADMIN_VIEW");
  if ("error" in gate) return gate.error;
  return NextResponse.json({ success: true, data: { campaigns: await getGrowthStore().listCampaigns() } });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, {
      maxBytes: env.maxRequestBodyBytes,
      allowedKeys: ["name", "type", "audience", "subject", "body", "action", "id"],
    });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const store = getGrowthStore();
  const auditIt = (action: AuditAction, targetId: string, reason: string): Promise<void> =>
    audit({
      actorUserId: admin.user.id, actorRole: admin.user.role, action,
      targetType: "campaign", targetId, reason, requestId: admin.requestId,
    });

  if (body.action === "run" && typeof body.id === "string") {
    const result = await runCampaign(body.id).catch((err: unknown) => {
      console.error(JSON.stringify({ event: "campaign_run_failed", id: body.id, message: String(err).slice(0, 200) }));
      return { error: "Could not run the campaign. Check server logs." };
    });
    if ("error" in result) {
      return NextResponse.json(errBody("BAD_REQUEST", result.error), { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  }
  if (body.action === "pause" || body.action === "resume") {
    if (typeof body.id !== "string") {
      return NextResponse.json(errBody("BAD_REQUEST", "Provide id."), { status: 400 });
    }
    const to = body.action === "pause" ? "PAUSED" : "ACTIVE";
    await store.updateCampaign(body.id, { status: to });
    await auditIt(body.action === "pause" ? "CAMPAIGN_PAUSED" : "CAMPAIGN_RESUMED", body.id, "operator action");
    return NextResponse.json({ success: true, data: { status: to } });
  }
  // create
  if (
    typeof body.name !== "string" || typeof body.type !== "string" ||
    typeof body.audience !== "string" || typeof body.subject !== "string" ||
    typeof body.body !== "string"
  ) {
    return NextResponse.json(errBody("BAD_REQUEST", "Provide name, type, audience, subject, body."), { status: 400 });
  }
  try {
    const rec = await createCampaign({
      name: body.name, type: body.type as "win_back" | "inactive_nudge" | "announcement",
      audience: body.audience, subject: body.subject, body: body.body, createdBy: admin.user.id,
    });
    await auditIt("CAMPAIGN_CREATED", rec.id, "campaign created");
    return NextResponse.json({ success: true, data: { id: rec.id } }, { status: 201 });
  } catch (err) {
    console.error(JSON.stringify({ event: "campaign_create_failed", message: String(err).slice(0, 200) }));
    return NextResponse.json(errBody("BAD_REQUEST", "Could not create the campaign."), { status: 400 });
  }
}
