import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getEmailService } from "@/lib/email";
import type { AccountStore } from "@/lib/accounts/types";
import type { UserRecord } from "@/lib/accounts/types";

const BCRYPT_COST = 12;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export const SESSION_COOKIE = "sf_session";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

export function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim()) && email.length <= 254;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 128) return "Password must be at most 128 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

export function sessionCookie(token: string, maxAgeSec: number): string {  const secure = env.appUrl.startsWith("https://");
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

export function expiredCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

type StoredUser = UserRecord & { passwordHash: string };

/** Strip the password hash before returning user objects to callers. */
export function toPublicUser(row: StoredUser): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AuthService {
  constructor(private readonly store: AccountStore) {}

  async register(email: string, password: string, name?: string): Promise<{ user: UserRecord; verifyToken: string }> {
    const clean = email.trim();
    if (!validateEmail(clean)) throw new AppError("BAD_REQUEST", "Enter a valid email address.");
    const pwErr = validatePassword(password);
    if (pwErr) throw new AppError("BAD_REQUEST", pwErr);
    const existing = await this.store.getUserByEmail(clean.toLowerCase());
    if (existing) throw new AppError("BAD_REQUEST", "Could not create the account. Try logging in instead.");
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await this.store.createUser({
      id: newId("usr"),
      email: clean,
      passwordHash,
      name: name?.trim().slice(0, 80) || undefined,
    });
    const verifyToken = newToken();
    await this.store.createAuthToken({
      id: hashToken(verifyToken), userId: user.id, purpose: "verify", expiresAt: Date.now() + VERIFY_TTL_MS,
    });
    await getEmailService().send({
      to: clean,
      subject: "Verify your SnapFlow account",
      text: `Welcome! Verify your email within 24 hours:\n${env.appUrl}/verify?token=${verifyToken}`,
    });
    logger.info("user_registered", { user: user.id });
    return { user, verifyToken };
  }

  async verifyEmail(token: string): Promise<boolean> {
    const userId = await this.store.consumeAuthToken(hashToken(token), "verify", Date.now());
    if (!userId) return false;
    await this.store.updateUser(userId, { emailVerifiedAt: Date.now() });
    return true;
  }

  /** Re-issue a verification email for an unverified account. Idempotent. */
  async resendVerification(userId: string): Promise<boolean> {
    const row = await this.store.getUserById(userId);
    if (!row || row.status !== "ACTIVE" || row.emailVerifiedAt) return false;
    const verifyToken = newToken();
    await this.store.createAuthToken({
      id: hashToken(verifyToken), userId: row.id, purpose: "verify", expiresAt: Date.now() + VERIFY_TTL_MS,
    });
    await getEmailService().send({
      to: row.email,
      subject: "Verify your SnapFlow account",
      text: `Verify your email within 24 hours:\n${env.appUrl}/verify?token=${verifyToken}`,
    });
    logger.info("verification_resent", { user: userId });
    return true;
  }

  async login(email: string, password: string): Promise<{ user: UserRecord; token: string }> {
    const row = await this.store.getUserByEmail(email.trim().toLowerCase());
    // Same cost whether or not the account exists (timing parity).
    const hash = row?.passwordHash ?? "$2b$12$...............................................";
    const ok = await bcrypt.compare(password, hash);
    if (!row || !ok || row.status !== "ACTIVE") {
      throw new AppError("BAD_REQUEST", "Invalid email or password.");
    }
    const token = newToken();
    await this.store.createSession({
      id: hashToken(token), userId: row.id, expiresAt: Date.now() + SESSION_TTL_MS, lastSeenAt: Date.now(),
    });
    const user = toPublicUser(row);
    logger.info("user_login", { user: user.id });
    return { user, token };
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(hashToken(token));
  }

  /** Returns the active user for a session token, refreshing sliding expiry. */
  async userForToken(token: string): Promise<UserRecord | null> {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
    const sess = await this.store.getSession(hashToken(token));
    if (!sess || sess.expiresAt < Date.now()) return null;
    const row = await this.store.getUserById(sess.userId);
    if (!row || row.status !== "ACTIVE") return null;
    const now = Date.now();
    await this.store.touchSession(sess.id, now);
    return toPublicUser(row);
  }

  async requestPasswordReset(email: string): Promise<void> {
    // Generic: never reveal whether the address exists.
    const row = await this.store.getUserByEmail(email.trim().toLowerCase());
    if (row && row.status === "ACTIVE") {
      const token = newToken();
      await this.store.createAuthToken({
        id: hashToken(token), userId: row.id, purpose: "reset", expiresAt: Date.now() + RESET_TTL_MS,
      });
      await getEmailService().send({
        to: row.email,
        subject: "Reset your SnapFlow password",
        text: `Reset within 1 hour:\n${env.appUrl}/reset-password?token=${token}\nIf you didn't ask, ignore this.`,
      });
    }
    logger.info("password_reset_requested", {});
  }

  async resetPassword(token: string, password: string): Promise<boolean> {
    const pwErr = validatePassword(password);
    if (pwErr) throw new AppError("BAD_REQUEST", pwErr);
    const userId = await this.store.consumeAuthToken(hashToken(token), "reset", Date.now());
    if (!userId) return false;
    await this.store.setPasswordHash(userId, await bcrypt.hash(password, BCRYPT_COST));
    await this.store.deleteUserSessions(userId); // invalidate all sessions
    logger.info("password_reset", { user: userId });
    return true;
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const row = await this.store.getUserById(userId);
    if (!row) throw new AppError("BAD_REQUEST", "Account not found.");
    if (!(await bcrypt.compare(current, row.passwordHash))) {
      throw new AppError("BAD_REQUEST", "Current password is incorrect.");
    }
    const pwErr = validatePassword(next);
    if (pwErr) throw new AppError("BAD_REQUEST", pwErr);
    await this.store.setPasswordHash(userId, await bcrypt.hash(next, BCRYPT_COST));
    await this.store.deleteUserSessions(userId);
  }
}
