import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";
import {
  SmtpEmailService,
  __resetEmailService,
  __setEmailService,
  getEmailService,
} from "@/lib/email";
import { validateEnv } from "@/lib/config/validate";
import { MemoryAccountStore } from "@/lib/accounts/memory";
import { AuthService } from "@/lib/auth/service";

const PW = "correct-horse-9-battery";
let n = 0;
const uniq = (p: string): string => `${p}-${Date.now()}-${n++}@example.com`;

function streamTransport() {
  return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
}

/** Minimal quoted-printable decoder for assertions (ASCII content only). */
function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
function capturing(t: ReturnType<typeof streamTransport>): {
  transport: ReturnType<typeof streamTransport>;
  out: { envelopeTo: string[]; text: string }[];
} {
  const out: { envelopeTo: string[]; text: string }[] = [];
  const orig = t.sendMail.bind(t);
  t.sendMail = (async (msg: Parameters<typeof orig>[0]) => {
    const info = (await orig(msg)) as { envelope: { to: string[] }; message: Buffer };
    out.push({ envelopeTo: info.envelope.to, text: info.message.toString() });
    return info;
  }) as typeof orig;
  return { transport: t, out };
}

describe("email: smtp driver delivers without network (stream transport)", () => {
  it("sends to/subject/text through the injected transport", async () => {
    const { transport, out } = capturing(streamTransport());
    const svc = new SmtpEmailService(transport, "noreply@example.com");
    await svc.send({ to: "user@example.com", subject: "Verify", text: "hello link" });
    expect(out).toHaveLength(1);
    expect(out[0]!.envelopeTo).toContain("user@example.com");
    expect(out[0]!.text).toContain("Subject: Verify");
    expect(out[0]!.text).toContain("hello link");
  });

  it("registration mail carries the verification link", async () => {
    const { transport, out } = capturing(streamTransport());
    __setEmailService(new SmtpEmailService(transport, "noreply@example.com"));
    try {
      const store = new MemoryAccountStore();
      const auth = new AuthService(store);
      const email = uniq("verify-mail");
      const { verifyToken } = await auth.register(email, PW);
      expect(out).toHaveLength(1);
      expect(out[0]!.envelopeTo).toContain(email);
      // The body is quoted-printable (soft wraps and =3D escapes), so
      // decode before asserting on the full verification link.
      expect(decodeQuotedPrintable(out[0]!.text)).toContain(`/verify?token=${verifyToken}`);
    } finally {
      __resetEmailService();
    }
  });

  it("resend issues a fresh link and stops after verification", async () => {
    const { transport, out } = capturing(streamTransport());
    __setEmailService(new SmtpEmailService(transport, "noreply@example.com"));
    try {
      const store = new MemoryAccountStore();
      const auth = new AuthService(store);
      const email = uniq("resend-mail");
      const { user, verifyToken: first } = await auth.register(email, PW);
      expect(await auth.resendVerification(user.id)).toBe(true);
      expect(out).toHaveLength(2);
      const second = decodeQuotedPrintable(out[1]!.text).match(/\/verify\?token=([A-Za-z0-9_-]+)/);
      expect(second).not.toBeNull();
      expect(second![1]).not.toBe(first);
      expect(await auth.verifyEmail(second![1] as string)).toBe(true);
      // Verified accounts get no further mail (no enumeration oracle).
      expect(await auth.resendVerification(user.id)).toBe(false);
      expect(out).toHaveLength(2);
      expect(await auth.resendVerification("no-such-user")).toBe(false);
    } finally {
      __resetEmailService();
    }
  });

  it("defaults to the log driver (no delivery) unless smtp is selected", async () => {
    __resetEmailService();
    try {
      const svc = getEmailService();
      expect(svc).toBe(getEmailService()); // singleton
      await svc.send({ to: "nobody@example.com", subject: "t", text: "t" });
    } finally {
      __resetEmailService();
    }
  });
});

describe("email: production validation", () => {
  it("requires smtp + credentials in production, stays silent in dev", () => {
    const prod = validateEnv({}, "production").map((i) => i.variable);
    expect(prod).toContain("EMAIL_DRIVER");
    const smtpBare = validateEnv({ EMAIL_DRIVER: "smtp" }, "production").map((i) => i.variable);
    expect(smtpBare).toContain("SMTP_HOST");
    expect(smtpBare).toContain("SMTP_USER");
    expect(smtpBare).toContain("SMTP_PASS");
    const wired = validateEnv(
      { EMAIL_DRIVER: "smtp", SMTP_HOST: "mail.example.com", SMTP_USER: "u", SMTP_PASS: "ok-value-123" },
      "production"
    ).map((i) => i.variable);
    expect(wired).not.toContain("EMAIL_DRIVER");
    expect(wired).not.toContain("SMTP_HOST");
    expect(validateEnv({}, "development")).toEqual([]);
  });

  it("flags placeholder smtp passwords", () => {
    const issues = validateEnv(
      { EMAIL_DRIVER: "smtp", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "test" },
      "production"
    );
    expect(issues.map((i) => i.variable)).toContain("SMTP_PASS");
  });
});
