import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { AuthService, sessionCookie } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { authGuard, errBody, readAuthBody } from "../_helpers";

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await authGuard(req);
  if (guard) return guard;
  const body = await readAuthBody(req, ["email", "password"]);
  if (body instanceof NextResponse) return body;
  const { email, password } = body as { email: unknown; password: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    const e = new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  try {
    const { user, token } = await new AuthService(getAccountStore()).login(email, password);
    const res = NextResponse.json(
      { success: true, data: { user: { id: user.id, email: user.email, name: user.name } } }
    );
    res.headers.set("Set-Cookie", sessionCookie(token, 30 * 24 * 60 * 60));
    return res;
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
}
