import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGrowthStore } from "@/lib/server";
import { affiliateLink, affiliateStats, applyForAffiliate } from "@/lib/growth/affiliates";
import { env } from "@/lib/config/env";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

async function affiliatesEnabled(): Promise<boolean> {
  const { isEnabled } = await import("@/lib/admin/flags");
  return isEnabled("affiliates_enabled", true);
}

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to view affiliate status."), { status: 401 });
  }
  if (!(await affiliatesEnabled())) {
    return NextResponse.json(errBody("BAD_REQUEST", "The affiliate program is currently disabled."), { status: 503 });
  }
  const aff = await getGrowthStore().getAffiliateByUser(user.id);
  if (!aff) return NextResponse.json({ success: true, data: { application: null } });
  const stats = await affiliateStats(aff.id);
  return NextResponse.json({
    success: true,
    data: {
      application: {
        status: aff.status,
        code: aff.code,
        link: affiliateLink(aff.code, env.appUrl.replace(/\/$/, "")),
        commissionRate: aff.commissionRate,
      },
      ...stats,
    },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to apply."), { status: 401 });
  }
  if (!(await affiliatesEnabled())) {
    return NextResponse.json(errBody("BAD_REQUEST", "The affiliate program is currently disabled."), { status: 503 });
  }
  const app = await applyForAffiliate(user.id);
  return NextResponse.json({ success: true, data: app }, { status: 201 });
}
