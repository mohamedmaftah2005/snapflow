import { env } from "@/lib/config/env";
import { appEnv } from "@/lib/config/validate";
import type { AccountStore, UserRecord } from "@/lib/accounts/types";

/**
 * Dev-only first-admin bootstrap. When ADMIN_EMAILS contains this user's
 * email (case-insensitive) and we are NOT in production, promote the
 * account to ADMIN on sign-in.
 *
 * Production ignores ADMIN_EMAILS entirely — promote via SQL there
 * (see docs/admin.md). Never set real addresses on shared hosts.
 */
export async function maybePromoteAdmin(store: AccountStore, user: UserRecord): Promise<void> {
  if (appEnv() === "production") return;
  if (user.role === "ADMIN") return;
  if (env.adminEmails.length === 0) return;
  if (!env.adminEmails.includes(user.email.toLowerCase())) return;
  await store.updateUser(user.id, { role: "ADMIN" });
}
