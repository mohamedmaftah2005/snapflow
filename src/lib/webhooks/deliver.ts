import { randomBytes } from "node:crypto";
import { decryptWebhookSecret, signWebhookPayload } from "@/lib/api/crypto";
import { getApiStore } from "@/lib/server";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import { safeFetchWebhook } from "@/lib/webhooks/fetch";
import type { WebhookEventName } from "@/lib/api/types";

const DISABLE_AFTER_FAILURES = 10;

export interface DeliveryInput {
  endpointId: string;
  eventId: string;
  type: WebhookEventName | "test.event";
  data: Record<string, unknown>;
}

/**
 * Single delivery attempt. Throws on retryable failures (network, timeout,
 * 5xx) so BullMQ backs off and retries; 4xx responses are terminal.
 * Health (consecutive failures, auto-disable) is updated on every outcome.
 */
export async function deliverWebhook(input: DeliveryInput): Promise<void> {
  const store = getApiStore();
  const ep = await store.getWebhookEndpoint(input.endpointId);
  if (!ep || !ep.active) {
    await store.recordDelivery({
      id: `dlv_${randomBytes(8).toString("hex")}`,
      endpointId: input.endpointId,
      eventId: input.eventId,
      eventType: input.type,
      status: "DISABLED",
      attempts: 0,
      error: "Endpoint inactive or deleted.",
      createdAt: Date.now(),
    });
    return;
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({
    id: input.eventId,
    type: input.type,
    created_at: new Date().toISOString(),
    data: input.data,
  });
  const secret = decryptWebhookSecret(ep.secretEncrypted);
  const signature = signWebhookPayload(secret, timestamp, rawBody);

  let httpStatus: number | undefined;
  let attemptError: string | undefined;
  try {
    const res = await safeFetchWebhook(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SnapFlow-Signature": `t=${timestamp},v1=${signature}`,
        "X-SnapFlow-Event": input.type,
      },
      body: rawBody,
    });
    httpStatus = res.status;
    if (res.status >= 500) throw new Error(`Endpoint returned ${res.status}`);
    if (res.status >= 400) {
      // Terminal: record, reset nothing, do not retry.
      await store.recordDelivery({
        id: `dlv_${randomBytes(8).toString("hex")}`,
        endpointId: ep.id,
        eventId: input.eventId,
        eventType: input.type,
        status: "FAILED",
        httpStatus,
        attempts: 1,
        error: `Endpoint returned ${res.status}; not retried.`,
        createdAt: Date.now(),
      });
      await store.updateWebhookEndpoint(ep.id, { consecutiveFailures: ep.consecutiveFailures + 1 });
      inc("api_webhook_failed_total");
      return;
    }
  } catch (err) {
    attemptError = String(err).slice(0, 300);
  }

  if (attemptError) {
    await store.recordDelivery({
      id: `dlv_${randomBytes(8).toString("hex")}`,
      endpointId: ep.id,
      eventId: input.eventId,
      eventType: input.type,
      status: "FAILED",
      httpStatus,
      attempts: 1,
      error: attemptError,
      createdAt: Date.now(),
    });
    const failures = ep.consecutiveFailures + 1;
    await store.updateWebhookEndpoint(ep.id, {
      consecutiveFailures: failures,
      ...(failures >= DISABLE_AFTER_FAILURES ? { active: false } : {}),
    });
    if (failures >= DISABLE_AFTER_FAILURES) {
      logger.warn("webhook_endpoint_disabled", { endpoint: ep.id, failures });
    }
    inc("api_webhook_failed_total");
    throw new Error(attemptError); // retryable → BullMQ backoff
  }

  await store.recordDelivery({
    id: `dlv_${randomBytes(8).toString("hex")}`,
    endpointId: ep.id,
    eventId: input.eventId,
    eventType: input.type,
    status: "DELIVERED",
    httpStatus,
    attempts: 1,
    createdAt: Date.now(),
  });
  await store.updateWebhookEndpoint(ep.id, { consecutiveFailures: 0, lastDeliveredAt: Date.now() });
  inc("api_webhook_delivered_total");
  logger.info("webhook_delivered", { endpoint: ep.id, event: input.eventId });
}
