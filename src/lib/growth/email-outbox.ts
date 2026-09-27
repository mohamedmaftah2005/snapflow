import { randomBytes } from "node:crypto";
import { getGrowthStore } from "@/lib/server";
import { getEmailService } from "@/lib/email";
import { logger } from "@/lib/logger";
import { inc } from "@/lib/metrics";
import type { EmailStatus } from "@/lib/growth/types";

export interface QueuedEmail {
  logId: string;
  userId?: string;
  to: string;
  subject: string;
  text: string;
  marketing: boolean;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

/**
 * Queue a transactional email with an idempotency log row. The growth
 * worker (or local driver) delivers it; replays of the same logId are
 * skipped because the row flips to SENT exactly once.
 */
export async function queueEmail(input: {
  userId?: string;
  to: string;
  subject: string;
  text: string;
  marketing?: boolean;
}): Promise<string> {
  const store = getGrowthStore();
  if (input.marketing) {
    if (!input.userId) throw new Error("Marketing email requires a user");
    const { isEnabled } = await import("@/lib/admin/flags");
    const prefs = await store.getPreferences(input.userId);
    if (!prefs.marketingEmailOptIn || !(await isEnabled("marketing_enabled", true))) {
      const id = newId("eml");
      await store.logEmail({ id, userId: input.userId, type: "marketing", status: "SKIPPED", createdAt: Date.now() });
      logger.info("email_skipped_no_consent", { user: input.userId });
      return id;
    }
  }
  const id = newId("eml");
  await store.logEmail({
    id, userId: input.userId, type: input.marketing ? "marketing" : "transactional",
    status: "QUEUED", createdAt: Date.now(),
  });
  const { getQueue } = await import("@/lib/server");
  const q = getQueue();
  const payload = { logId: id, userId: input.userId, to: input.to, subject: input.subject, text: input.text, marketing: Boolean(input.marketing) };
  if (q.enqueueGrowth) await q.enqueueGrowth({ kind: "send-email", email: payload });
  else {
    const { getLocalQueue } = await import("@/lib/queue/local");
    await getLocalQueue().enqueueGrowth({ kind: "send-email", email: payload });
  }
  return id;
}

/** Worker-side delivery. QUEUED→SENT/FAILED; failures throw for retry. */
export async function sendEmailNow(email: QueuedEmail): Promise<void> {
  const store = getGrowthStore();
  const svc = getEmailService();
  try {
    if (email.marketing && svc.sendMarketing) await svc.sendMarketing({ to: email.to, subject: email.subject, text: email.text });
    else await (svc.sendTransactional?.({ to: email.to, subject: email.subject, text: email.text }) ?? svc.send({ to: email.to, subject: email.subject, text: email.text }));
    await store.setEmailStatus(email.logId, "SENT");
    inc("growth_email_sent_total");
  } catch (err) {
    await store.setEmailStatus(email.logId, "FAILED", String(err).slice(0, 300));
    inc("growth_email_failed_total");
    throw err; // retryable → queue backoff
  }
}

export type EmailLogStatus = EmailStatus;
