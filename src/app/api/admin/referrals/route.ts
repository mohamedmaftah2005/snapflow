import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getGrowthStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Referral review: relationships for one referrer (user IDs only, no emails). */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_VIEW");
  if ("error" in gate) return gate.error;
  const referrer = new URL(req.url).searchParams.get("referrer");
  if (!referrer || !/^[A-Za-z0-9_-]{8,64}$/.test(referrer)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Pass ?referrer=<userId>."), { status: 400 });
  }
  const rels = await getGrowthStore().listReferralsByReferrer(referrer);
  return NextResponse.json({
    success: true,
    data: {
      referrals: rels.map((r) => ({
        id: r.id, referredUserId: r.referredUserId, status: r.status, createdAt: r.createdAt,
      })),
    },
  });
}

/** Invalidate or reverse a suspicious referral (audited, never silent). */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["referredUserId", "action", "reason"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.referredUserId !== "string" || (body.action !== "invalidate" && body.action !== "reverse")) {
    return NextResponse.json(errBody("BAD_REQUEST", "Provide referredUserId and action invalidate|reverse."), { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 3) {
    return NextResponse.json(errBody("BAD_REQUEST", "A reason (min 3 chars) is required."), { status: 400 });
  }
  const store = getGrowthStore();
  const rel = await store.getReferralByReferred(body.referredUserId);
  if (!rel) {
    return NextResponse.json(errBody("BAD_REQUEST", "No referral for this user."), { status: 404 });
  }
  await store.setReferralStatus(rel.id, body.action === "invalidate" ? "INVALID" : "REVERSED");
  await audit({
    actorUserId: admin.user.id, actorRole: admin.user.role, action: "REFERRAL_REVERSED",
    targetType: "referral", targetId: rel.id, reason, requestId: admin.requestId,
  });
  return NextResponse.json({ success: true, data: {} });
}