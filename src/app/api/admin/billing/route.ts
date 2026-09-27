import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/guard";
import { getAccountStore } from "@/lib/server";

/** Billing operations view: webhook ledger + subscription states. No card data. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requirePermission(req, "BILLING_VIEW");
  if ("error" in gate) return gate.error;
  const u = new URL(req.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 20) || 20, 1), 50);
  const offset = Math.max(Number(u.searchParams.get("offset") ?? 0) || 0, 0);
  const { events, total } = await getAccountStore().listWebhookEvents({ limit, offset });
  return NextResponse.json({
    success: true,
    data: {
      note: "Card data lives exclusively at the payment provider; only subscription state is stored here.",
      webhooks: events,
      total,
      limit,
      offset,
    },
  });
}
