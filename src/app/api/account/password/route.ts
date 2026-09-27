import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { AuthService } from "@/lib/auth/service";
import { getAccountStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { env } from "@/lib/config/env";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage your account."), { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["current", "next"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.current !== "string" || typeof body.next !== "string") {
    const e = new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  try {
    await new AuthService(getAccountStore()).changePassword(user.id, body.current, body.next);
    return NextResponse.json({ success: true, data: {} });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
}
