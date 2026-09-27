import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getApiStore } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret } from "@/lib/api/crypto";
import { WEBHOOK_EVENTS, isValidWebhookEvent } from "@/lib/api/types";
import { assertSafeWebhookUrl } from "@/lib/webhooks/fetch";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

export const MAX_WEBHOOK_ENDPOINTS = 5;

function redact(e: {
  id: string; url: string; events: string[]; active: boolean;
  consecutiveFailures: number; lastDeliveredAt?: number; createdAt: number;
}) {
  return { ...e };
}

/** List endpoints (secrets never leave the server). */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage webhooks."), { status: 401 });
  }
  const list = await getApiStore().listWebhookEndpoints(user.id);
  return NextResponse.json({
    success: true,
    data: {
      endpoints: list.map((e) => ({
        id: e.id, url: e.url, events: e.events, active: e.active,
        consecutiveFailures: e.consecutiveFailures,
        lastDeliveredAt: e.lastDeliveredAt, createdAt: e.createdAt,
      })),
    },
  });
}

/** Create an endpoint. Raw secret returned exactly once. */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage webhooks."), { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["url", "events"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return NextResponse.json(errBody("BAD_REQUEST", "Provide a valid URL."), { status: 400 });
  }
  if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > WEBHOOK_EVENTS.length) {
    return NextResponse.json(errBody("BAD_REQUEST", "Select 1 or more events."), { status: 400 });
  }
  for (const e of body.events) {
    if (typeof e !== "string" || !isValidWebhookEvent(e)) {
      return NextResponse.json(errBody("BAD_REQUEST", `Unknown event: ${String(e).slice(0, 40)}.`), { status: 400 });
    }
  }
  try {
    await assertSafeWebhookUrl(body.url);
  } catch (err) {
    // Validator messages may include DNS/resolver detail: only repeat the
    // known-safe user-facing strings, never raw internals.
    const SAFE = new Set([
      "Invalid webhook URL",
      "Webhook URL must use HTTPS",
      "Webhook URL must not contain credentials",
      "Invalid webhook URL port",
      "Webhook host does not resolve",
      "Webhook target is not allowed",
    ]);
    const message = err instanceof Error && SAFE.has(err.message)
      ? err.message
      : "That webhook URL can't be used.";
    return NextResponse.json(errBody("BAD_REQUEST", message), { status: 400 });
  }
  const store = getApiStore();
  if ((await store.countWebhookEndpoints(user.id)) >= MAX_WEBHOOK_ENDPOINTS) {
    return NextResponse.json(errBody("BAD_REQUEST", `Endpoint limit reached (${MAX_WEBHOOK_ENDPOINTS}).`), { status: 400 });
  }
  let secretEncrypted: string;
  try {
    secretEncrypted = encryptWebhookSecret(generateWebhookSecret());
  } catch {
    return NextResponse.json(errBody("TEMPORARILY_UNAVAILABLE", "Webhooks are temporarily unavailable."), { status: 503 });
  }
  // Return the raw secret once: decrypt immediately, never persist plaintext.
  const id = `whep_${randomBytes(12).toString("base64url")}`;
  await store.createWebhookEndpoint({
    id,
    userId: user.id,
    url: body.url,
    secretEncrypted,
    events: (body.events as string[]).filter(isValidWebhookEvent),
    active: true,
    consecutiveFailures: 0,
    createdAt: Date.now(),
  });
  const created = await store.getWebhookEndpoint(id);
  if (!created) {
    return NextResponse.json(errBody("BAD_REQUEST", "Could not create the endpoint."), { status: 500 });
  }
  return NextResponse.json(
    {
      success: true,
      data: {
        endpoint: redact({
          id: created.id, url: created.url, events: created.events, active: created.active,
          consecutiveFailures: created.consecutiveFailures,
          lastDeliveredAt: created.lastDeliveredAt, createdAt: created.createdAt,
        }),
        secret: decryptWebhookSecret(secretEncrypted),
        warning: "Store this secret securely. It will only be shown once.",
      },
    },
    { status: 201 }
  );
}
