import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryAccountStore } from "@/lib/accounts/memory";
import { AuthService } from "@/lib/auth/service";
import { hasPermission } from "@/lib/admin/permissions";
import { __resetServerWiring } from "@/lib/server";
import { __resetFlagCache } from "@/lib/admin/flags";
import { GET as dashboardGET } from "@/app/api/admin/dashboard/route";
import { GET as usersGET } from "@/app/api/admin/users/route";
import { POST as userActionPOST } from "@/app/api/admin/users/[id]/[action]/route";
import { GET as userGET } from "@/app/api/admin/users/[id]/route";
import { POST as jobActionPOST } from "@/app/api/admin/jobs/[id]/[action]/route";
import { GET as flagsGET, POST as flagsPOST } from "@/app/api/admin/flags/route";
import { GET as auditGET } from "@/app/api/admin/audit-logs/route";
import { MemoryJobRepository } from "@/lib/jobs/memory";
import { getRepository } from "@/lib/server";
import type { UserRole } from "@/lib/accounts/types";

const PW = "admin-test-pw-1";
let n = 0;
const uniq = (p: string): string => `${p}-${Date.now()}-${n++}@example.com`;

async function makeUser(email: string, role: UserRole): Promise<{ id: string; token: string }> {
  const store = getMemoryAccountStore();
  const svc = new AuthService(store);
  const { user } = await svc.register(email, PW, role);
  await store.updateUser(user.id, { role });
  const login = await svc.login(email, PW);
  return { id: user.id, token: login.token };
}

function req(token?: string, method = "GET", body?: unknown): Request {
  return new Request("http://x/api/admin/x", {
    method,
    headers: {
      ...(token ? { cookie: `sf_session=${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function params<T extends Record<string, string>>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}

describe("phase 8: authorization matrix", () => {
  beforeEach(() => {
    __resetServerWiring();
    __resetFlagCache();
  });

  it("guest and normal users are denied everywhere", async () => {
    const normal = await makeUser(uniq("user"), "USER");
    expect((await dashboardGET(req())).status).toBe(401);
    expect((await dashboardGET(req(normal.token))).status).toBe(403);
    expect((await usersGET(req(normal.token))).status).toBe(403);
    expect((await flagsGET(req(normal.token))).status).toBe(403);
    expect((await auditGET(req(normal.token))).status).toBe(403);
  });

  it("support reads but cannot change anything", async () => {
    const support = await makeUser(uniq("support"), "SUPPORT");
    const victim = await makeUser(uniq("victim"), "USER");
    expect((await usersGET(req(support.token))).status).toBe(200);
    expect((await userGET(req(support.token), params({ id: victim.id }))).status).toBe(200);
    expect(
      (await userActionPOST(req(support.token, "POST", { reason: "x".repeat(10) }), params({ id: victim.id, action: "suspend" }))).status
    ).toBe(403);
    expect(
      (await flagsPOST(req(support.token, "POST", { key: "maintenance_mode", enabled: true, reason: "x".repeat(10) }))).status
    ).toBe(403);
  });

  it("operator cannot manage users or flags", async () => {
    const op = await makeUser(uniq("op"), "OPERATOR");
    const victim = await makeUser(uniq("victim"), "USER");
    expect(
      (await userActionPOST(req(op.token, "POST", { reason: "x".repeat(10) }), params({ id: victim.id, action: "suspend" }))).status
    ).toBe(403);
    expect(
      (await flagsPOST(req(op.token, "POST", { key: "maintenance_mode", enabled: true, reason: "x".repeat(10) }))).status
    ).toBe(403);
  });

  it("permission matrix follows least privilege", () => {
    expect(hasPermission("USER", "ADMIN_VIEW")).toBe(false);
    expect(hasPermission("SUPPORT", "USER_VIEW")).toBe(true);
    expect(hasPermission("SUPPORT", "USER_MANAGE")).toBe(false);
    expect(hasPermission("SUPPORT", "PROVIDER_MANAGE")).toBe(false);
    expect(hasPermission("OPERATOR", "JOB_MANAGE")).toBe(true);
    expect(hasPermission("OPERATOR", "USER_MANAGE")).toBe(false);
    expect(hasPermission("OPERATOR", "FLAG_MANAGE")).toBe(false);
    expect(hasPermission("ADMIN", "FLAG_MANAGE")).toBe(true);
  });
});

describe("phase 8: user actions + audit", () => {
  beforeEach(() => {
    __resetServerWiring();
    __resetFlagCache();
  });

  it("suspend/reactivate require reason, audit, and block self-harm", async () => {
    const store = getMemoryAccountStore();
    const admin = await makeUser(uniq("admin"), "ADMIN");
    const target = await makeUser(uniq("target"), "USER");
    const targetLogin = await new AuthService(store).login(`${target.id}@x`, PW).catch(() => null);
    void targetLogin;
    const act = (id: string, action: string, body?: unknown) =>
      userActionPOST(req(admin.token, "POST", body), params({ id, action }));

    expect((await act(target.id, "suspend", {})).status).toBe(400);
    // Find target email for session check.
    const users = await usersGET(req(admin.token));
    expect(users.status).toBe(200);
    const ok = await act(target.id, "suspend", { reason: "repeated TOS violations" });
    expect(ok.status).toBe(200);
    expect((await store.getUserById(target.id))?.status).toBe("SUSPENDED");
    // Self-suspend blocked.
    expect((await act(admin.id, "suspend", { reason: "oops, me" })).status).toBe(400);
    // Reactivate + audit trail exists and is append-only.
    expect((await act(target.id, "reactivate", { reason: "appeal accepted" })).status).toBe(200);
    const audit = await auditGET(req(admin.token));
    expect(audit.status).toBe(200);
    const actions = ((await audit.json()) as { data: { entries: { action: string }[] } }).data.entries.map((e) => e.action);
    expect(actions).toContain("USER_SUSPENDED");
    expect(actions).toContain("USER_REACTIVATED");
  });

  it("suspended sessions stop working", async () => {
    const store = getMemoryAccountStore();
    const admin = await makeUser(uniq("admin"), "ADMIN");
    const svc = new AuthService(store);
    const email = uniq("doomed");
    const { user } = await svc.register(email, PW);
    const login = await svc.login(email, PW);
    const { getSessionUser } = await import("@/lib/auth/session");
    const withCookie = (t: string) => new Request("http://x/", { headers: { cookie: `sf_session=${t}` } });
    expect(await getSessionUser(withCookie(login.token))).not.toBeNull();
    await userActionPOST(req(admin.token, "POST", { reason: "spam account XY" }), params({ id: user.id, action: "suspend" }));
    expect(await getSessionUser(withCookie(login.token))).toBeNull();
  });

  it("admin user responses never contain secrets", async () => {
    const admin = await makeUser(uniq("admin"), "ADMIN");
    const target = await makeUser(uniq("target"), "USER");
    const detail = await userGET(req(admin.token), params({ id: target.id }));
    const text = await detail.text();
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("sf_session");
    expect(text).not.toContain("STRIPE");
    const listText = await (await usersGET(req(admin.token))).text();
    expect(listText).not.toContain("passwordHash");
  });
});

describe("phase 8: job actions", () => {
  beforeEach(() => {
    __resetServerWiring();
    __resetFlagCache();
  });

  async function seed(status: string, errorCode?: string): Promise<string> {
    const repo = getRepository() as MemoryJobRepository;
    const now = Date.now();
    const id = `adm-job-${Date.now()}-${n++}`;
    await repo.create({
      id, status: status as never, provider: "tiktok",
      sourceUrl: "https://www.tiktok.com/@u/video/1",
      attempts: 1, createdAt: now, expiresAt: now + 60000,
      ...(errorCode ? { errorCode, errorMessage: "x" } : {}),
    });
    return id;
  }

  async function adminToken(): Promise<string> {
    return (await makeUser(uniq("admin"), "ADMIN")).token;
  }

  it("retry is idempotent and gated on retryability", async () => {
    const token = await adminToken();
    const failedTransient = await seed("FAILED", "TIMEOUT");
    const failedPerm = await seed("FAILED", "PRIVATE_CONTENT");
    const done = await seed("COMPLETED");
    const act = (id: string, reason: string) =>
      jobActionPOST(req(token, "POST", { reason }), params({ id, action: "retry" }));

    expect((await act(failedTransient, "provider recovered")).status).toBe(200);
    const repo = getRepository() as MemoryJobRepository;
    expect((await repo.get(failedTransient))?.status).toBe("QUEUED");
    // Duplicate retry on the now-QUEUED job is rejected (no duplicate work).
    expect((await act(failedTransient, "again")).status).toBe(400);
    // Permanent failures and completed jobs are not retryable.
    expect((await act(failedPerm, "try anyway")).status).toBe(400);
    expect((await act(done, "try anyway")).status).toBe(400);
  });

  it("cancel moves pending jobs to CANCELED, rejects others", async () => {
    const token = await adminToken();
    const queued = await seed("QUEUED");
    const done = await seed("COMPLETED");
    const act = (id: string, reason: string) =>
      jobActionPOST(req(token, "POST", { reason }), params({ id, action: "cancel" }));
    expect((await act(queued, "user asked")).status).toBe(200);
    const repo = getRepository() as MemoryJobRepository;
    expect((await repo.get(queued))?.status).toBe("CANCELED");
    expect((await act(done, "user asked")).status).toBe(400);
  });
});

describe("phase 8: flags, providers, maintenance", () => {
  beforeEach(() => {
    __resetServerWiring();
    __resetFlagCache();
  });

  it("unknown flags and missing reasons are rejected; changes audit", async () => {
    const admin = await makeUser(uniq("admin"), "ADMIN");
    const post = (body: unknown) => flagsPOST(req(admin.token, "POST", body));
    expect((await post({ key: "nope", enabled: true, reason: "because reasons" })).status).toBe(400);
    expect((await post({ key: "maintenance_mode", enabled: true, reason: "x" })).status).toBe(400);
    expect((await post({ key: "maintenance_mode", enabled: true, reason: "deploy window 12:00" })).status).toBe(200);
    const list = await flagsGET(req(admin.token));
    const flags = ((await list.json()) as { data: { flags: { key: string; enabled: boolean; source: string }[] } }).data.flags;
    expect(flags.find((f) => f.key === "maintenance_mode")).toMatchObject({ enabled: true, source: "db" });
    // Maintenance blocks new public downloads with 503 (before any validation/network).
    const { POST: createPOST } = await import("@/app/api/download/route");
    const blocked = await createPOST(
      new Request("http://x/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://www.tiktok.com/@u/video/1" }),
      })
    );
    expect(blocked.status).toBe(503);
    expect((await post({ key: "maintenance_mode", enabled: false, reason: "window over" })).status).toBe(200);
  });

  it("disabling a provider rejects new jobs for it", async () => {
    const admin = await makeUser(uniq("admin"), "ADMIN");
    const { POST: providerPOST } = await import("@/app/api/admin/providers/route");
    const call = (body: unknown) => providerPOST(req(admin.token, "POST", body));
    expect((await call({ id: "tiktok", status: "disabled", reason: "incident test" })).status).toBe(200);
    const { getProviderRegistry } = await import("@/lib/providers/registry");
    expect(getProviderRegistry().resolve("https://www.tiktok.com/@u/video/1")).toBeNull();
    expect((await call({ id: "tiktok", status: "enabled", reason: "incident resolved" })).status).toBe(200);
    expect(getProviderRegistry().resolve("https://www.tiktok.com/@u/video/1")?.id).toBe("tiktok");
  });
});
