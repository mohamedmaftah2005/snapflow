import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { AuthService, sessionCookie } from "@/lib/auth/service";
import { maybePromoteAdmin } from "@/lib/auth/admin-bootstrap";
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
  const store = getAccountStore();
  let user;
  let token: string;
  try {
    ({ user, token } = await new AuthService(store).login(email, password));
  } catch {
    // Login has exactly one failure mode (unknown email or wrong password —
    // the service dummy-compares hashes so both look identical). Say so
    // plainly instead of the generic catalog text, which mentions URLs.
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid email or password."), { status: 400 });
  }
  try {
    await maybePromoteAdmin(store, user);
  } catch {
    // Bootstrap must never break sign-in; promote via SQL instead.
  }
  const res = NextResponse.json(
    { success: true, data: { user: { id: user.id, email: user.email, name: user.name } } }
  );
  res.headers.set("Set-Cookie", sessionCookie(token, 30 * 24 * 60 * 60));
  return res;
}
