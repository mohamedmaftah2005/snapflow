import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getGrowthStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

const PREF_KEYS = ["marketingEmailOptIn", "downloadNotify", "referralNotify", "affiliateNotify"] as const;

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to view preferences."), { status: 401 });
  }
  return NextResponse.json({ success: true, data: await getGrowthStore().getPreferences(user.id) });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage preferences."), { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: [...PREF_KEYS] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== "boolean") {
      return NextResponse.json(errBody("BAD_REQUEST", `Preference ${k} must be boolean.`), { status: 400 });
    }
  }
  const prefs = await getGrowthStore().setPreferences(user.id, body as Partial<Record<(typeof PREF_KEYS)[number], boolean>>);
  return NextResponse.json({ success: true, data: prefs });
}
