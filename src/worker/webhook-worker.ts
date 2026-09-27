import { deliverWebhook as run } from "@/lib/webhooks/deliver";
import type { WebhookEventName } from "@/lib/api/types";
import type { WebhookQueuePayload } from "@/lib/queue/types";

/** Shared delivery entry used by the BullMQ consumer and the local driver. */
export async function deliverWebhook(payload: WebhookQueuePayload): Promise<void> {
  await run({
    endpointId: payload.endpointId,
    eventId: payload.eventId,
    type: payload.type as WebhookEventName,
    data: payload.data as Record<string, unknown>,
  });
}
