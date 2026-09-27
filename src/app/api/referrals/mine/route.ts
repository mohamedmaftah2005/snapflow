import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { getSessionUser } from "@/lib/auth/session";
import { myReferralCode, referralStats } from "@/lib/growth/referrals";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Referrer dashboard data: link, funnel counts. No referred emails exposed. */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to view referrals."), { status: 401 });
  }
  const { isEnabled } = await import("@/lib/admin/flags");
  if (!(await isEnabled("referrals_enabled", true))) {
    return NextResponse.json(errBody("BAD_REQUEST", "Referrals are currently disabled."), { status: 503 });
  }
  const { code } = await myReferralCode(user.id);
  const { pending, qualified, rewarded } = await referralStats(user.id);
  const base = env.appUrl.replace(/\/$/, "");
  return NextResponse.json({
    success: true,
    data: {
      link: `${base}/?ref=${code}`,
      pending,
      qualified,
      rewarded,
      reward: `${env.referralTrialDays}-day Premium trial per qualified referral (max ${env.maxReferralRewards} rewards)`,
    },
  });
}
