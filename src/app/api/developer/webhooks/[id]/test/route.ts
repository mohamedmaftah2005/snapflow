import { NextResponse } from "next/server";
import { testRoute } from "../_actions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return testRoute(req, id);
}
