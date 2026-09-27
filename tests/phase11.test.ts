import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appEnv, appVersion, buildInfo, validateEnv } from "@/lib/config/validate";
import { beatHeartbeat, readHeartbeats } from "@/lib/worker/heartbeat";
import { checkReadiness } from "@/lib/health";
import { GET as versionGET } from "@/app/api/version/route";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as readyGET } from "@/app/api/ready/route";
import { __resetServerWiring } from "@/lib/server";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("phase 11: env validation", () => {
  it("fails fast on missing production config, never prints values", () => {
    const issues = validateEnv({}, "production");
    const names = issues.map((i) => i.variable);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("REDIS_URL");
    expect(names).toContain("API_KEY_PEPPER");
    expect(names).toContain("WEBHOOK_SECRET_KEY");
    expect(JSON.stringify(issues)).not.toContain("supersecret");
    expect(validateEnv({}, "development")).toEqual([]);
  });

  it("rejects http app urls and placeholder secrets in production", () => {
    const issues = validateEnv(
      {
        APP_URL: "http://example.com",
        DATABASE_URL: "x",
        REDIS_URL: "x",
        API_KEY_PEPPER: "changeme",
        WEBHOOK_SECRET_KEY: "ok-value-123",
      },
      "production"
    );
    expect(issues.map((i) => i.variable)).toContain("APP_URL");
    expect(issues.map((i) => i.variable)).toContain("API_KEY_PEPPER");
  });

  it("resolves environment names safely", () => {
    expect(appEnv("production")).toBe("production");
    expect(appEnv("staging")).toBe("staging");
    expect(appEnv("test")).toBe("staging");
    expect(appEnv("development")).toBe("development");
    expect(appEnv("weird-value")).toBe("development");
  });
});

describe("phase 11: health model", () => {
  it("liveness is cheap and versioned without secrets", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const b = (await res.json()) as Record<string, unknown>;
    expect(b.status).toBe("alive");
    expect(typeof b.version).toBe("string");
    expect(JSON.stringify(b)).not.toMatch(/SECRET|PASSWORD|PRIVATE|TOKEN/i);
  });

  it("readiness reports per-dependency state with 200/503 semantics", async () => {
    __resetServerWiring();
    const res = await readyGET();
    const b = (await res.json()) as { status: string; checks: Record<string, string> };
    expect([200, 503]).toContain(res.status);
    expect(typeof b.checks.db).toBe("string");
    expect(typeof b.checks.queue).toBe("string");
    expect(b.status).toBe(res.status === 200 ? "ready" : "not-ready");
  });

  it("version endpoint exposes build identity only", async () => {
    const res = await versionGET();
    expect(res.status).toBe(200);
    const b = (await res.json()) as Record<string, unknown>;
    expect(typeof b.version).toBe("string");
    expect(typeof b.node).toBe("string");
    expect(JSON.stringify(b)).not.toMatch(/SECRET|PASSWORD|PRIVATE|TOKEN|DATABASE_URL/i);
    expect(appVersion().name).toBe("snapflow");
    expect(buildInfo().commit).toBeNull();
  });

  it("worker heartbeats publish and expire", async () => {
    await beatHeartbeat();
    const live = await readHeartbeats();
    expect(live.length).toBeGreaterThan(0);
    expect(live[0]).toMatchObject({ activeJobs: expect.any(Number) as number });
    expect(await readHeartbeats(-1)).toEqual([]);
  });

  it("checkReadiness never throws", async () => {
    __resetServerWiring();
    const r = await checkReadiness();
    expect(typeof r.ready).toBe("boolean");
    expect(typeof r.checks).toBe("object");
  });
});

describe("phase 11: retention purges", () => {
  it("idempotency and delivery ledgers purge by age", async () => {
    const { getMemoryApiStore } = await import("@/lib/api/memory");
    const store = getMemoryApiStore();
    const old = Date.now() - 1000;
    await store.saveIdempotency({
      key: "k-old", userId: "u", apiKeyId: "k", requestHash: "h",
      response: {}, statusCode: 200, expiresAt: old,
    });
    expect(await store.purgeExpiredIdempotency(Date.now())).toBeGreaterThanOrEqual(1);
    await store.recordDelivery({
      id: "d-old", endpointId: "e", eventId: "ev", eventType: "test.event",
      status: "DELIVERED", attempts: 1, createdAt: old - 40 * 24 * 3600 * 1000,
    });
    expect(await store.purgeDeliveries(Date.now() - 30 * 24 * 3600 * 1000)).toBe(1);
  });
});

describe("phase 11: CI and deploy artifacts", () => {
  it("CI runs lockfile-strict install, gates, build, and audit", async () => {
    const yml = await fs.readFile(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    for (const needle of [
      "npm ci",
      "npm run lint",
      "npm run typecheck",
      "npm run test",
      "npm run build",
      "npm audit",
      "package-lock.json",
      "node-version: 24",
    ]) {
      expect(yml).toContain(needle);
    }
    expect(yml).not.toMatch(/npm install[^ ]/);
    expect(yml).not.toMatch(/\.env/);
  });

  it("systemd units run as non-root with caps and no secrets", async () => {
    for (const unit of ["snapflow-web.service", "snapflow-worker.service"]) {
      const text = await fs.readFile(path.join(repoRoot, "deploy", "systemd", unit), "utf8");
      expect(text).toContain("User=snapflow");
      expect(text).toContain("NoNewPrivileges=true");
      expect(text).toContain("MemoryMax=");
      expect(text).not.toMatch(/PASSWORD|SECRET|TOKEN=.+/);
    }
    const worker = await fs.readFile(path.join(repoRoot, "deploy", "systemd", "snapflow-worker.service"), "utf8");
    expect(worker).toContain("TimeoutStopSec=");
  });

  it("smoke script checks the public contract without creating work", async () => {
    const script = await fs.readFile(path.join(repoRoot, "scripts", "smoke.mjs"), "utf8");
    for (const needle of ["/api/health", "/api/ready", "/api/version", "/openapi.json", "robots.txt", "INVALID_API_KEY"]) {
      expect(script).toContain(needle);
    }
    expect(script).not.toContain("/api/download");
    expect(script).not.toContain("/api/batch");
  });
});
