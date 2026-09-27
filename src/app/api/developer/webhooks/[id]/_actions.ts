import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getApiStore, getQueue } from "@/lib/server";
import { readJsonBody } from "@/lib/validation/request";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret } from "@/lib/api/crypto";
import { isValidWebhookEvent, type WebhookEndpointRecord } from "@/lib/api/types";
import { assertSafeWebhookUrl } from "@/lib/webhooks/fetch";
import { inc } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import type { UserRecord } from "@/lib/accounts/types";

function errBody(code: string, message: string): { success: false; error: { code: string; message: string } } {
  return { success: false, error: { code, message } };
}

async function owned(req: Request, id: string): Promise<
  | { error: NextResponse }
  | { ep: WebhookEndpointRecord; user: UserRecord }
> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    return { error: NextResponse.json(errBody("BAD_REQUEST", "Invalid endpoint ID."), { status: 400 }) };
  }
  const user = await getSessionUser(req);
  if (!user) {
    return { error: NextResponse.json(errBody("BAD_REQUEST", "Sign in to manage webhooks."), { status: 401 }) };
  }
  const ep = await getApiStore().getWebhookEndpoint(id);
  if (!ep || ep.userId !== user.id) {
    return { error: NextResponse.json(errBody("BAD_REQUEST", "Endpoint not found."), { status: 404 }) };
  }
  return { ep, user };
}

/** Rotate secret: new secret takes effect immediately; old stops working. */
export async function rotateRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await owned(req, id);
  if ("error" in loaded) return loaded.error;
  let secretEncrypted: string;
  try {
    secretEncrypted = encryptWebhookSecret(generateWebhookSecret());
  } catch {
    return NextResponse.json(errBody("TEMPORARILY_UNAVAILABLE", "Webhooks are temporarily unavailable."), { status: 503 });
  }
  await getApiStore().updateWebhookEndpoint(id, { secretEncrypted, consecutiveFailures: 0 });
  logger.info("webhook_secret_rotated", { user: loaded.user.id, endpoint: id });
  return NextResponse.json({
    success: true,
    data: { secret: decryptWebhookSecret(secretEncrypted), warning: "Shown once. Update your receiver now." },
  });
}

/** Enable/disable or change subscribed events. */
export async function patchRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await owned(req, id);
  if ("error" in loaded) return loaded.error;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { maxBytes: env.maxRequestBodyBytes, allowedKeys: ["active", "events"] });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
    return NextResponse.json(errBody(e.code, e.userMessage), { status: e.status });
  }
  const patch: { active?: boolean; events?: import("@/lib/api/types").WebhookEventName[] } = {};
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json(errBody("BAD_REQUEST", "active must be boolean."), { status: 400 });
    }
    patch.active = body.active;
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(errBody("BAD_REQUEST", "Select 1 or more events."), { status: 400 });
    }
    for (const e of body.events) {
      if (typeof e !== "string" || !isValidWebhookEvent(e)) {
        return NextResponse.json(errBody("BAD_REQUEST", "Unknown event."), { status: 400 });
      }
    }
    patch.events = (body.events as string[]).filter(isValidWebhookEvent);
  }
  await getApiStore().updateWebhookEndpoint(id, patch);
  return NextResponse.json({ success: true, data: {} });
}

export async function deleteRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await owned(req, id);
  if ("error" in loaded) return loaded.error;
  await getApiStore().deleteWebhookEndpoint(loaded.user.id, id);
  return NextResponse.json({ success: true, data: {} });
}

/** Send a test.event through the real queue + signer (no real download). */
export async function testRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await owned(req, id);
  if ("error" in loaded) return loaded.error;
  const { ep } = loaded;
  if (!ep.events.includes("test.event")) {
    return NextResponse.json(errBody("BAD_REQUEST", "Endpoint is not subscribed to test.event."), { status: 400 });
  }
  const eventId = `evt_test_${randomBytes(8).toString("hex")}`;
  const q = getQueue();
  if (q.enqueueWebhook) await q.enqueueWebhook({ endpointId: id, eventId, type: "test.event", data: { ping: true } });
  else {
    const { getLocalQueue } = await import("@/lib/queue/local");
    await getLocalQueue().enqueueWebhook({ endpointId: id, eventId, type: "test.event", data: { ping: true } });
  }
  inc("api_webhook_test_total");
  return NextResponse.json({ success: true, data: { eventId } }, { status: 202 });
}

/** Recent deliveries (sanitized payloads stay server-side). */
export async function deliveriesRoute(req: Request, id: string): Promise<NextResponse> {
  const loaded = await owned(req, id);
  if ("error" in loaded) return loaded.error;
  // Revalidate stored URL on read (defense in depth; never blocks the list).
  try {
    await assertSafeWebhookUrl(loaded.ep.url);
  } catch {
    // listed anyway; delivery will fail closed with a clear error
  }
  const deliveries = await getApiStore().listDeliveries(id, 20);
  return NextResponse.json({ success: true, data: { deliveries } });
}
