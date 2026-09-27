import { NextResponse } from "next/server";
import { retryRoute } from "../_actions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return retryRoute(req, id);
}
