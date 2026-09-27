import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { AuthService } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { authGuard, errBody, readAuthBody } from "../_helpers";

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await authGuard(req);
  if (guard) return guard;
  const body = await readAuthBody(req, ["email"]);
  if (body instanceof NextResponse) return body;
  if (typeof body.email !== "string") {
    const e = new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  // Always generic: never reveal whether the address exists.
  await new AuthService(getAccountStore()).requestPasswordReset(body.email);
  return NextResponse.json({
    success: true,
    data: { message: "If an account exists for that email, a reset link was sent." },
  });
}
