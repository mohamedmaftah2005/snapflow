import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailService {
  send(msg: EmailMessage): Promise<void>;
  sendTransactional?(msg: EmailMessage): Promise<void>;
  sendMarketing?(msg: EmailMessage): Promise<void>;
}

/**
 * Transactional email seam. Default driver logs (dev) — swap for an SMTP /
 * Resend-backed implementation in production without touching auth code.
 * sendMarketing refuses unless the driver explicitly supports it.
 */
class LogEmailService implements EmailService {
  async send(msg: EmailMessage): Promise<void> {
    return this.sendTransactional(msg);
  }

  async sendTransactional(msg: EmailMessage): Promise<void> {
    logger.info("email_queued", { to: "[redacted]", subject: msg.subject });
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:dev] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    }
  }

  async sendMarketing(msg: EmailMessage): Promise<void> {
    // Log driver never sends bulk marketing; production drivers override.
    logger.info("email_marketing_skipped", { to: "[redacted]", subject: msg.subject });
  }
}

let service: EmailService = new LogEmailService();

export function getEmailService(): EmailService {
  return service;
}

/** Test-only override. */
export function __setEmailService(s: EmailService): void {
  service = s;
}
