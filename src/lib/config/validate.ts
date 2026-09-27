import { createRequire } from "node:module";

export type AppEnv = "development" | "staging" | "production";

export function appEnv(from?: string): AppEnv {
  const v = (from ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  if (v === "production") return "production";
  if (v === "staging" || v === "test") return "staging";
  return "development";
}

export interface EnvIssue {
  variable: string;
  problem: string;
}

const SECRET_LIKE = ["SECRET", "PASSWORD", "PRIVATE", "TOKEN", "SIGNING", "PEPPER", "CREDENTIAL"];

/**
 * Startup validation. Production fails fast on missing/insecure config;
 * development only warns (documented). Never prints values.
 */
export function validateEnv(env: Record<string, string | undefined>, target: AppEnv): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const need = (name: string, problem: string): void => {
    if (!env[name]) issues.push({ variable: name, problem });
  };

  // APP_URL has a safe local default; only production pins it down.
  if (target === "production") {
    need("APP_URL", "required: public base URL");
    need("DATABASE_URL", "required in production");
    need("REDIS_URL", "required in production (bullmq driver)");
    need("API_KEY_PEPPER", "required: API key hashing has no insecure fallback");
    need("WEBHOOK_SECRET_KEY", "required: webhook secrets cannot be encrypted without it");
    if (env.APP_URL && !env.APP_URL.startsWith("https://")) {
      issues.push({ variable: "APP_URL", problem: "must be https in production" });
    }
    if (env.STORAGE_DRIVER === "s3") {
      need("STORAGE_BUCKET", "required for the s3 driver");
      need("STORAGE_ACCESS_KEY", "required for the s3 driver");
      need("STORAGE_SECRET_KEY", "required for the s3 driver");
    }
    if (env.BILLING_PROVIDER === "stripe") {
      need("STRIPE_SECRET_KEY", "required for the stripe driver");
      need("STRIPE_WEBHOOK_SECRET", "required to verify Stripe webhooks");
      need("STRIPE_PRICE_PREMIUM", "required for checkout");
    }
    for (const [k, v] of Object.entries(env)) {
      if (!v) continue;
      const upper = k.toUpperCase();
      if (SECRET_LIKE.some((s) => upper.includes(s)) && /^(test|dev|changeme|password123?)$/i.test(v)) {
        issues.push({ variable: k, problem: "looks like a placeholder secret" });
      }
    }
  }
  return issues;
}

export function appVersion(): { name: string; version: string } {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../../package.json") as { name?: string; version?: string };
    return { name: pkg.name ?? "snapflow", version: pkg.version ?? "0.0.0" };
  } catch {
    return { name: "snapflow", version: "0.0.0" };
  }
}

export function buildInfo(): { commit: string | null; buildTime: string | null } {
  return {
    commit: process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    buildTime: process.env.BUILD_TIME ?? null,
  };
}
