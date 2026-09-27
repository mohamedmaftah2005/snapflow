import { NextResponse } from "next/server";
import { requireApiKey, v1Ok } from "../_auth";
import { getEntitlement, usageFor } from "@/lib/entitlements";
import { getClientIp } from "@/lib/client-ip";
import { getAccountStore } from "@/lib/server";
import { toPublicUser } from "@/lib/auth/service";

/** GET /api/v1/usage — same entitlement service as the dashboard. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["usage:read"]);
  if ("error" in gate) return gate.error;
  const { ctx: c } = gate;
  const row = await getAccountStore().getUserById(c.user.id);
  if (!row) {
    const { v1Error } = await import("../_auth");
    return v1Error("FORBIDDEN", "Account unavailable.", c.requestId, 403);
  }
  const ent = await getEntitlement(toPublicUser(row));
  const usage = await usageFor(ent, getClientIp(req));
  const month = new Date().toISOString().slice(0, 7);
  return v1Ok(
    {
      period: month,
      downloads: { used: usage.downloads, limit: usage.limit },
      concurrent_jobs: { limit: 5 },
    },
    c.requestId
  );
}
