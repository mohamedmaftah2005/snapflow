import { NextResponse } from "next/server";
import { rotateRoute } from "../_actions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return rotateRoute(req, id);
}
