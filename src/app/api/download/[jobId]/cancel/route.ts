import { NextResponse } from "next/server";
import { cancelJob } from "../_actions";

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const { jobId } = await ctx.params;
  return cancelJob(req, jobId);
}
