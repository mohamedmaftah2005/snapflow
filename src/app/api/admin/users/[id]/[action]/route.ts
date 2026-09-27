import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { getAccountStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import type { UserStatus } from "@/lib/accounts/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Controlled user actions. Destructive/high-impact actions require a reason
 * and are audit-logged. Admins cannot change their own status/role here.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; action: string }> }
): Promise<NextResponse> {
  const gate = await requirePermission(req, "USER_MANAGE");
  if ("error" in gate) return gate.error;
  const { ctx: admin } = gate;
  const { id, action } = await ctx.params;
  const store = getAccountStore();

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["reason"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 3) {
    return NextResponse.json(errBody("BAD_REQUEST", "A reason (min 3 chars) is required."), { status: 400 });
  }
  const target = await store.getUserById(id);
  if (!target) {
    return NextResponse.json(errBody("NOT_FOUND", "User not found."), { status: 404 });
  }
  if (target.id === admin.user.id) {
    return NextResponse.json(errBody("BAD_REQUEST", "You cannot change your own account."), { status: 400 });
  }

  if (action === "suspend" || action === "reactivate") {
    const status: UserStatus = action === "suspend" ? "SUSPENDED" : "ACTIVE";
    await store.updateUser(id, { status });
    if (action === "suspend") await store.deleteUserSessions(id);
    await audit({
      actorUserId: admin.user.id, actorRole: admin.user.role,
      action: action === "suspend" ? "USER_SUSPENDED" : "USER_REACTIVATED",
      targetType: "user", targetId: id, reason, requestId: admin.requestId,
    });
    return NextResponse.json({ success: true, data: { status } });
  }
  return NextResponse.json(errBody("BAD_REQUEST", "Unknown action."), { status: 400 });
}
