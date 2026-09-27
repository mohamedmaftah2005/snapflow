import { NextResponse } from "next/server";
import { requireApiKey, v1Ok } from "../_auth";
import { getEntitlement } from "@/lib/entitlements";
import { getAccountStore } from "@/lib/server";
import { toPublicUser } from "@/lib/auth/service";

/** GET /api/v1/account — plan only, no personal data beyond necessity. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["account:read"]);
  if ("error" in gate) return gate.error;
  const { ctx: c } = gate;
  const row = await getAccountStore().getUserById(c.user.id);
  if (!row) {
    const { v1Error } = await import("../_auth");
    return v1Error("FORBIDDEN", "Account unavailable.", c.requestId, 403);
  }
  const ent = await getEntitlement(toPublicUser(row));
  return v1Ok({ plan: ent.plan.id.toUpperCase(), status: row.status }, c.requestId);
}
