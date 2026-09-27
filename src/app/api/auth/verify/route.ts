import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { AuthService } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { authGuard, errBody, readAuthBody } from "../_helpers";

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await authGuard(req);
  if (guard) return guard;
  const body = await readAuthBody(req, ["token"]);
  if (body instanceof NextResponse) return body;
  if (typeof body.token !== "string") {
    const e = new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const ok = await new AuthService(getAccountStore()).verifyEmail(body.token);
  return NextResponse.json({ success: true, data: { verified: ok } });
}
