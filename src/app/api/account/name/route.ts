import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { env } from "@/lib/config/env";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

/** Update display name. Billing state can never be changed here. */
export async function PATCH(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage your account."), { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["name"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 80) {
    const e = new AppError("BAD_REQUEST", "Name must be 1–80 characters.");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  await getAccountStore().updateUser(user.id, { name: body.name.trim() });
  return NextResponse.json({ success: true, data: { name: body.name.trim() } });
}
