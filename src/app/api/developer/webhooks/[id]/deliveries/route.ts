import { NextResponse } from "next/server";
import { deliveriesRoute } from "../_actions";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return deliveriesRoute(req, id);
}
