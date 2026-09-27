import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

/**
 * Error-monitoring integration point (Sentry or equivalent).
 * Without SENTRY_DSN this logs securely and no-ops.
 * To enable: set SENTRY_DSN, install @sentry/nextjs, and forward
 * the event here. Never attach URLs, bodies, or headers.
 */
export function reportError(err: unknown, context: Record<string, unknown>): void {
  const safe = {
    message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    ...context,
  };
  if (!env.sentryDsn) {
    logger.error("error_reported", safe);
    return;
  }
  // DSN configured but SDK not wired — fail visible, not silent.
  logger.error("error_reported", { ...safe, sentry: "dsn_set_sdk_missing" });
}
