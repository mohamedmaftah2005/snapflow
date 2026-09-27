import { NextResponse } from "next/server";
import { retryJob } from "../_actions";

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const { jobId } = await ctx.params;
  return retryJob(req, jobId);
}
