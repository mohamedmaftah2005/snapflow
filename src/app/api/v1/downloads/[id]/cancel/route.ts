import { NextResponse } from "next/server";
import { cancelRoute } from "../_actions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return cancelRoute(req, id);
}
