import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/config/env";
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

/**
 * Production SMTP driver (nodemailer). Used when EMAIL_DRIVER=smtp.
 * Accepts an injected transporter for tests (streamTransport: no network).
 * Marketing consent is enforced upstream in queueEmail — by the time a
 * message reaches sendMarketing, it is approved to send.
 */
export class SmtpEmailService implements EmailService {
  constructor(
    private readonly injected?: Transporter,
    private readonly from?: string
  ) {}

  private async transport(): Promise<Transporter> {
    if (this.injected) return this.injected;
    if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
      throw new Error("SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS)");
    }
    return nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure, // true = port 465 implicit TLS
      requireTLS: !env.smtpSecure, // enforce STARTTLS on submission ports
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }

  async sendTransactional(msg: EmailMessage): Promise<void> {
    const t = await this.transport();
    await t.sendMail({
      from: this.from ?? env.emailFromAddress,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
    logger.info("email_sent", { to: "[redacted]", subject: msg.subject });
  }

  async send(msg: EmailMessage): Promise<void> {
    return this.sendTransactional(msg);
  }

  async sendMarketing(msg: EmailMessage): Promise<void> {
    return this.sendTransactional(msg);
  }
}

let service: EmailService | null = null;

export function getEmailService(): EmailService {
  if (service) return service;
  service = env.emailDriver === "smtp" ? new SmtpEmailService() : new LogEmailService();
  return service;
}

/** Test-only override. */
export function __setEmailService(s: EmailService): void {
  service = s;
}

/** Test-only reset (drops the cached singleton/override). */
export function __resetEmailService(): void {
  service = null;
}
