import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { AuthService, sessionCookie } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { authGuard, errBody, readAuthBody } from "../_helpers";

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await authGuard(req);
  if (guard) return guard;
  const { isEnabled } = await import("@/lib/admin/flags");
  if (!(await isEnabled("registration_enabled", false))) {
    return NextResponse.json(errBody("BAD_REQUEST", "Registration is currently disabled."), { status: 503 });
  }
  const body = await readAuthBody(req, ["email", "password", "name"]);
  if (body instanceof NextResponse) return body;
  const { email, password, name } = body as { email: unknown; password: unknown; name?: unknown };
  if (typeof email !== "string" || typeof password !== "string" || (name !== undefined && typeof name !== "string")) {
    const e = new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  try {
    const svc = new AuthService(getAccountStore());
    const { user, verifyToken: _vt } = await svc.register(email, password, name);
    void _vt;
    // Growth attribution: ref/aff cookies are server-validated, never trusted.
    try {
      const { attributeSignup } = await import("@/lib/growth/referrals");
      const cookie = req.headers.get("cookie") ?? "";
      const pick = (name: string): string | undefined => {
        const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
        return m ? decodeURIComponent(m[1] as string).slice(0, 32) : undefined;
      };
      await attributeSignup(user.id, { ref: pick("sf_ref"), aff: pick("sf_aff") });
    } catch {
      // attribution must never break registration
    }
    const { token } = await svc.login(email, password);
    const res = NextResponse.json(
      { success: true, data: { user: { id: user.id, email: user.email, name: user.name } } },
      { status: 201 }
    );
    res.headers.set("Set-Cookie", sessionCookie(token, 30 * 24 * 60 * 60));
    return res;
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
}
