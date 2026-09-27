import { NextResponse } from "next/server";
import { deleteRoute, patchRoute } from "./_actions";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return patchRoute(req, id);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  return deleteRoute(req, id);
}
