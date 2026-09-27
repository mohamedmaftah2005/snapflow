import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getGrowthStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { affiliateApprovedNotify } from "@/lib/growth/lifecycle";
import type { AffiliateStatus } from "@/lib/growth/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_VIEW");
  if ("error" in gate) return gate.error;
  const status = new URL(req.url).searchParams.get("status") as AffiliateStatus | null;
  if (status && !["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"].includes(status)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid status filter."), { status: 400 });
  }
  const list = await getGrowthStore().listAffiliates(status ?? undefined);
  return NextResponse.json({
    success: true,
    data: {
      affiliates: await Promise.all(
        list.map(async (a) => {
          const { affiliateStats } = await import("@/lib/growth/affiliates");
          const stats = await affiliateStats(a.id);
          return {
            id: a.id, userId: a.userId, status: a.status,
            commissionRate: a.commissionRate, createdAt: a.createdAt, ...stats,
          };
        })
      ),
    },
  });
}

/** Approve / suspend / reactivate / rate-change. Audited, reason required. */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["id", "action", "reason", "rate"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.id !== "string" || !["approve", "suspend", "reactivate"].includes(String(body.action))) {
    return NextResponse.json(errBody("BAD_REQUEST", "Provide id and action approve|suspend|reactivate."), { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 3) {
    return NextResponse.json(errBody("BAD_REQUEST", "A reason (min 3 chars) is required."), { status: 400 });
  }
  const store = getGrowthStore();
  const aff = await store.getAffiliateById(body.id);
  if (!aff) {
    return NextResponse.json(errBody("BAD_REQUEST", "Affiliate not found."), { status: 404 });
  }
  const action = body.action as string;
  const to: AffiliateStatus = action === "approve" || action === "reactivate" ? "ACTIVE" : "SUSPENDED";
  const patch: { status: AffiliateStatus; commissionRate?: number } = { status: to };
  if (body.rate !== undefined) {
    if (typeof body.rate !== "number" || body.rate < 0 || body.rate > 1) {
      return NextResponse.json(errBody("BAD_REQUEST", "Rate must be 0–1."), { status: 400 });
    }
    patch.commissionRate = body.rate;
  }
  await store.updateAffiliate(aff.id, patch);
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role,
    action: to === "ACTIVE" ? "AFFILIATE_APPROVED" : "AFFILIATE_SUSPENDED",
    targetType: "affiliate", targetId: aff.id, reason, requestId: admin.requestId,
  });
  if (to === "ACTIVE" && aff.status === "PENDING") {
    await affiliateApprovedNotify(aff.userId, aff.code).catch(() => undefined);
  }
  return NextResponse.json({ success: true, data: { status: to } });
}
