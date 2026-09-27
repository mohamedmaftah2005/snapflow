import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError, userMessageFor } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getApiStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { createApiKey, toPublicKey } from "@/lib/api/keys";
import { isValidScope } from "@/lib/api/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

const EXPIRIES: Record<string, number | null> = {
  never: null,
  "30d": 30 * 24 * 3600 * 1000,
  "90d": 90 * 24 * 3600 * 1000,
  "1y": 365 * 24 * 3600 * 1000,
};

/** List keys (metadata only — raw values are never recoverable). */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage API keys."), { status: 401 });
  }
  const keys = await getApiStore().listApiKeys(user.id);
  return NextResponse.json({ success: true, data: { keys: keys.map(toPublicKey) } });
}

/** Create a key. The raw value is returned exactly once. */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage API keys."), { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["name", "scopes", "expires"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) {
    return NextResponse.json(errBody("BAD_REQUEST", "Name must be 1–80 characters."), { status: 400 });
  }
  if (!Array.isArray(body.scopes) || body.scopes.length === 0 || body.scopes.length > 9) {
    return NextResponse.json(errBody("BAD_REQUEST", "Select 1–9 scopes."), { status: 400 });
  }
  for (const s of body.scopes) {
    if (typeof s !== "string" || !isValidScope(s)) {
      return NextResponse.json(errBody("BAD_REQUEST", `Unknown scope: ${String(s).slice(0, 40)}.`), { status: 400 });
    }
  }
  const expiresKey = typeof body.expires === "string" ? body.expires : "never";
  if (!(expiresKey in EXPIRIES)) {
    return NextResponse.json(errBody("BAD_REQUEST", "Invalid expiration choice."), { status: 400 });
  }
  try {
    const { record, raw } = await createApiKey(user, {
      name: body.name.trim(),
      scopes: (body.scopes as string[]).filter(isValidScope),
      expiresAt: EXPIRIES[expiresKey] ? Date.now() + (EXPIRIES[expiresKey] as number) : undefined,
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          key: record,
          raw,
          warning: "Store this key securely. It will only be shown once.",
        },
      },
      { status: 201 }
    );
  } catch (err) {
    // AppError.message may carry internal detail — only userMessage leaves.
    const code = err instanceof AppError && err.code === "PLAN_LIMIT_REACHED" ? "PLAN_LIMIT_REACHED" : "BAD_REQUEST";
    const status = code === "PLAN_LIMIT_REACHED" ? 429 : 400;
    const message = code === "PLAN_LIMIT_REACHED"
      ? userMessageFor("PLAN_LIMIT_REACHED")
      : "Could not create the key.";
    return NextResponse.json(errBody(code, message), { status });
  }
}
