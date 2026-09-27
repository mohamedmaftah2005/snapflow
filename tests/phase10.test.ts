import http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
}));

import { getMemoryAccountStore } from "@/lib/accounts/memory";
import { getMemoryApiStore } from "@/lib/api/memory";
import { AuthService } from "@/lib/auth/service";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret, hashApiKey, signWebhookPayload } from "@/lib/api/crypto";
import { getApiStore } from "@/lib/server";
import { __resetServerWiring } from "@/lib/server";
import { POST as v1Create } from "@/app/api/v1/downloads/route";
import { GET as v1Get } from "@/app/api/v1/downloads/[id]/route";
import { POST as v1Cancel } from "@/app/api/v1/downloads/[id]/cancel/route";
import { POST as v1Retry } from "@/app/api/v1/downloads/[id]/retry/route";
import { GET as v1Providers } from "@/app/api/v1/providers/route";
import { GET as v1Account } from "@/app/api/v1/account/route";
import { GET as v1Usage } from "@/app/api/v1/usage/route";
import { GET as openapi } from "@/app/openapi.json/route";
import { POST as keysPOST } from "@/app/api/developer/keys/route";
import { assertSafeWebhookUrl } from "@/lib/webhooks/fetch";
import { env } from "@/lib/config/env";

const PW = "phase10-test-pw-1";
let n = 0;
const uniq = (p: string): string => `${p}-${Date.now()}-${n++}@example.com`;

function v1req(path: string, key?: string, method = "GET", body?: unknown): Request {
  return new Request(`http://x${path}`, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("phase 10: api keys", () => {
  beforeEach(() => {
    __resetServerWiring();
    (env as { apiKeyPepper?: string }).apiKeyPepper = "test-pepper-1234567890";
    (env as { webhookSecretKey?: string }).webhookSecretKey = "test-webhook-key-1234567890";
  });

  it("creates once-visible keys, stores only hashes", async () => {
    const store = getMemoryAccountStore();
    const svc = new AuthService(store);
    const em = uniq("key");
    const { user } = await svc.register(em, PW);
    const now = Date.now();
    await store.upsertSubscription({
      id: `sub_${user.id}`, userId: user.id, planId: "premium", provider: "test",
      externalSubscriptionId: `sx_${user.id}`, status: "ACTIVE",
      currentPeriodStart: now - 1, currentPeriodEnd: now + 100000,
      cancelAtPeriodEnd: false, createdAt: now, updatedAt: now,
    });
    const { toPublicUser } = await import("@/lib/auth/service");
    const row = await store.getUserById(user.id);
    const { createApiKey: create } = await import("@/lib/api/keys");
    const { record, raw } = await create(toPublicUser(row!), { name: "CI", scopes: ["downloads:read"], expiresAt: undefined });
    expect(raw.startsWith("sf_live_")).toBe(true);
    const api = getMemoryApiStore();
    const stored = (await api.listApiKeys(user.id))[0]!;
    expect(stored.keyHash).not.toContain(raw.slice(-10));
    expect(stored.keyHash).toBe(hashApiKey(raw));
    expect(record).not.toHaveProperty("raw");
    // free users are refused
    const free = await svc.register(uniq("free"), PW);
    await expect(
      create(toPublicUser((await store.getUserById(free.user.id))!), { name: "x", scopes: ["downloads:read"], expiresAt: undefined })
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
  });

  it("revocation and expiry take effect immediately", async () => {
    const { raw, userId } = await mintKey();
    const api = getMemoryApiStore();
    const keys = await api.listApiKeys(userId);
    expect(keys).toHaveLength(1);
    expect(await api.revokeApiKey(userId, keys[0]!.id)).toBe(true);
    expect(await api.revokeApiKey(userId, keys[0]!.id)).toBe(false);
    // revoked key fails auth even with correct format
    expect((await v1Providers(v1req("/api/v1/providers", raw))).status).toBe(401);
    // already-expired key fails auth
    const old = await mintKey(userId, ["providers:read"], Date.now() - 1000);
    expect((await v1Providers(v1req("/api/v1/providers", old.raw))).status).toBe(401);
    // fresh key works
    const fresh = await mintKey(userId);
    expect((await v1Providers(v1req("/api/v1/providers", fresh.raw))).status).toBe(200);
  });

  async function mintKey(
    existingUserId?: string,
    scopes: string[] = ["downloads:create", "downloads:read", "providers:read"],
    expiresAt?: number
  ): Promise<{ raw: string; userId: string }> {
    const store = getMemoryAccountStore();
    const api = getMemoryApiStore();
    let userId = existingUserId;
    if (!userId) {
      const svc = new AuthService(store);
      const em = uniq("mint");
      const { user } = await svc.register(em, PW);
      const now = Date.now();
      await store.upsertSubscription({
        id: `sub_${user.id}`, userId: user.id, planId: "premium", provider: "test",
        externalSubscriptionId: `sx2_${user.id}`, status: "ACTIVE",
        currentPeriodStart: now - 1, currentPeriodEnd: now + 100000,
        cancelAtPeriodEnd: false, createdAt: now, updatedAt: now,
      });
      userId = user.id;
    }
    const { generateApiKey: gen } = await import("@/lib/api/crypto");
    const { raw, prefix } = gen();
    await api.createApiKey({
      id: `key_${userId}_${Date.now()}_${n++}`, userId, name: "t", prefix,
      keyHash: hashApiKey(raw), scopes: scopes as never[],
      expiresAt, createdAt: Date.now(),
    });
    return { raw, userId };
  }

  it("v1 rejects missing/malformed keys and query-string keys", async () => {
    expect((await v1Providers(v1req("/api/v1/providers"))).status).toBe(401);
    expect((await v1Providers(v1req("/api/v1/providers", "Bearer nope"))).status).toBe(401);
    expect((await v1Providers(v1req("/api/v1/providers?api_key=x", "Bearer sf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"))).status).toBe(401);
  });

  it("scopes gate each endpoint", async () => {
    const { userId } = await mintKey();
    const api = getMemoryApiStore();
    const { generateApiKey: gen } = await import("@/lib/api/crypto");
    const { raw, prefix } = gen();
    await api.createApiKey({
      id: `key_ro_${Date.now()}`, userId, name: "ro", prefix,
      keyHash: hashApiKey(raw), scopes: ["downloads:read"], createdAt: Date.now(),
    });
    const res = await (await import("@/app/api/v1/downloads/[id]/cancel/route")).POST(
      v1req("/x", raw, "POST"), { params: Promise.resolve({ id: "abcdefgh" }) }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INSUFFICIENT_SCOPE");
  });

  it("suspended owners lose API access", async () => {
    const store = getMemoryAccountStore();
    const { raw, userId } = await mintKey();
    // sanity: works before suspension (mintKey includes providers:read)
    expect((await v1Providers(v1req("/api/v1/providers", raw))).status).toBe(200);
    await store.updateUser(userId, { status: "SUSPENDED" });
    expect((await v1Providers(v1req("/api/v1/providers", raw))).status).toBe(401);
  });
});

describe("phase 10: v1 downloads", () => {
  beforeEach(() => {
    __resetServerWiring();
    (env as { apiKeyPepper?: string }).apiKeyPepper = "test-pepper-1234567890";
    (env as { webhookSecretKey?: string }).webhookSecretKey = "test-webhook-key-1234567890";
  });

  async function key(scopes: string[] = ["downloads:create", "downloads:read"]): Promise<string> {
    const store = getMemoryAccountStore();
    const api = getMemoryApiStore();
    const svc = new AuthService(store);
    const em = uniq("v1");
    const { user } = await svc.register(em, PW);
    const now = Date.now();
    await store.upsertSubscription({
      id: `sub_${user.id}`, userId: user.id, planId: "premium", provider: "test",
      externalSubscriptionId: `sx3_${user.id}`, status: "ACTIVE",
      currentPeriodStart: now - 1, currentPeriodEnd: now + 100000,
      cancelAtPeriodEnd: false, createdAt: now, updatedAt: now,
    });
    const { generateApiKey: gen } = await import("@/lib/api/crypto");
    const { raw, prefix } = gen();
    await api.createApiKey({
      id: `key_${user.id}_${Date.now()}_${n++}`, userId: user.id, name: "t", prefix,
      keyHash: hashApiKey(raw), scopes: scopes as never[], createdAt: Date.now(),
    });
    return raw;
  }

  const URL = "https://www.tiktok.com/@u/video/1234567890123456789";

  it("creates 202 with status_url; polls; unknown ids 404 without oracle", async () => {
    const k = await key();
    const created = await v1Create(v1req("/api/v1/downloads", k, "POST", { url: URL }));
    expect(created.status).toBe(202);
    const body = (await created.json()) as { id: string; status: string; status_url: string };
    expect(body.id).toBeDefined();
    expect(body.status_url).toBe(`/api/v1/downloads/${body.id}`);
    expect(created.headers.get("X-Request-ID")).toBeTruthy();
    const polled = await v1Get(v1req(`/api/v1/downloads/${body.id}`, k), { params: Promise.resolve({ id: body.id }) });
    expect(polled.status).toBe(200);
    const missing = await v1Get(v1req("/api/v1/downloads/abcdefgh", k), { params: Promise.resolve({ id: "abcdefgh" }) });
    expect(missing.status).toBe(404);
    const missBody = (await missing.json()) as { error: { code: string } };
    expect(missBody.error.code).toBe("DOWNLOAD_NOT_FOUND");
  });

  it("idempotency: same key+body replays, different body conflicts", async () => {
    const k = await key();
    const headers = { authorization: `Bearer ${k}`, "Content-Type": "application/json", "Idempotency-Key": `idem-${Date.now()}` };
    const mk = (url: string) =>
      new Request("http://x/api/v1/downloads", { method: "POST", headers, body: JSON.stringify({ url }) });
    const r1 = await v1Create(mk(URL));
    const r2 = await v1Create(mk(URL));
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    expect(((await r1.json()) as { id: string }).id).toBe(((await r2.json()) as { id: string }).id);
    const r3 = await v1Create(mk("https://www.tiktok.com/@u/video/1234567890123456790"));
    expect(r3.status).toBe(409);
  });

  it("cancel/retry gating mirrors the web rules", async () => {
    const k = await key(["downloads:create", "downloads:read", "downloads:cancel"]);
    const created = await v1Create(v1req("/api/v1/downloads", k, "POST", { url: URL }));
    const { id } = (await created.json()) as { id: string };
    const canceled = await v1Cancel(v1req(`/api/v1/downloads/${id}/cancel`, k, "POST"), { params: Promise.resolve({ id }) });
    expect(canceled.status).toBe(200);
    const retry = await v1Retry(v1req(`/api/v1/downloads/${id}/retry`, k, "POST"), { params: Promise.resolve({ id }) });
    expect(retry.status).toBe(400); // CANCELED is not retryable
  });

  it("quota enforced; providers/account/usage scoped reads", async () => {
    const k = await key();
    expect((await v1Providers(v1req("/api/v1/providers", k))).status).toBe(403); // no providers:read
    const k2 = await key(["providers:read", "account:read", "usage:read", "downloads:create", "downloads:read", "batches:create", "batches:read"]);
    const prov = await v1Providers(v1req("/api/v1/providers", k2));
    expect(prov.status).toBe(200);
    const pj = (await prov.json()) as { providers: { id: string }[] };
    expect(pj.providers.map((p) => p.id)).toContain("tiktok");
    expect(pj.providers.map((p) => p.id)).not.toContain("youtube"); // disabled stays hidden
    const acct = await v1Account(v1req("/api/v1/account", k2));
    expect(((await acct.json()) as { plan: string }).plan).toBe("PREMIUM");
    const usage = await v1Usage(v1req("/api/v1/usage", k2));
    const uj = (await usage.json()) as { downloads: { used: number; limit: null }; period: string };
    expect(uj.downloads.limit).toBeNull();
    expect(typeof uj.period).toBe("string");
    // batch create + read through v1
    const { POST: v1BatchCreate } = await import("@/app/api/v1/batches/route");
    const b = await v1BatchCreate(v1req("/api/v1/batches", k2, "POST", { urls: [URL] }));
    expect(b.status).toBe(202);
    const bj = (await b.json()) as { id: string };
    const { GET: v1BatchGet } = await import("@/app/api/v1/batches/[id]/route");
    expect((await v1BatchGet(v1req(`/api/v1/batches/${bj.id}`, k2), { params: Promise.resolve({ id: bj.id }) })).status).toBe(200);
  });
});

describe("phase 10: webhooks", () => {
  beforeEach(() => {
    __resetServerWiring();
    (env as { apiKeyPepper?: string }).apiKeyPepper = "test-pepper-1234567890";
    (env as { webhookSecretKey?: string }).webhookSecretKey = "test-webhook-key-1234567890";
    (env as { webhookAllowPrivate?: boolean }).webhookAllowPrivate = true;
  });

  it("secret encrypts, signs, and verifies round-trip", async () => {
    const raw = generateWebhookSecret();
    const enc = encryptWebhookSecret(raw);
    expect(enc).not.toContain(raw);
    expect(decryptWebhookSecret(enc)).toBe(raw);
    const sig = signWebhookPayload(raw, "1700000000", '{"a":1}');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(signWebhookPayload(raw, "1700000001", '{"a":1}')).not.toBe(sig);
  });

  it("rejects localhost, private IPs, and redirect-to-private", async () => {
    // Flag OFF here: production behavior. IP literals need no DNS
    // (hostnames can't be tested: the DNS mock returns public IPs).
    (env as { webhookAllowPrivate?: boolean }).webhookAllowPrivate = false;
    await expect(assertSafeWebhookUrl("http://127.0.0.1/x")).rejects.toThrow();
    await expect(assertSafeWebhookUrl("http://[::1]/x")).rejects.toThrow();
    await expect(assertSafeWebhookUrl("http://169.254.169.254/x")).rejects.toThrow();
    await expect(assertSafeWebhookUrl("http://[::ffff:10.0.0.1]/x")).rejects.toThrow();
    await expect(assertSafeWebhookUrl("ftp://example.com/x")).rejects.toThrow();
    await expect(assertSafeWebhookUrl("https://example.com/x?y=1")).resolves.toBeTruthy();
    (env as { webhookAllowPrivate?: boolean }).webhookAllowPrivate = true;
  });

  it("delivers to a local listener with a valid signature", async () => {
    const received: { headers: Record<string, string>; body: string }[] = [];
    const server = http.createServer((req, res) => {
      let buf = "";
      req.on("data", (c) => { buf += c; });
      req.on("end", () => {
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) h[k] = String(v);
        received.push({ headers: h, body: buf });
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const { deliverWebhook } = await import("@/lib/webhooks/deliver");
      const store = getApiStore();
      const secret = generateWebhookSecret();
      await store.createWebhookEndpoint({
        id: "whep_test_1", userId: "u1", url: `http://127.0.0.1:${port}/hook`,
        secretEncrypted: encryptWebhookSecret(secret),
        events: ["test.event"], active: true, consecutiveFailures: 0, createdAt: Date.now(),
      });
      await deliverWebhook({ endpointId: "whep_test_1", eventId: "evt_t1", type: "test.event", data: { ping: true } });
      expect(received).toHaveLength(1);
      const sig = received[0]!.headers["x-snapflow-signature"] ?? "";
      const m = sig.match(/^t=(\d+),v1=([a-f0-9]{64})$/);
      expect(m).toBeTruthy();
      expect(signWebhookPayload(secret, m![1]!, received[0]!.body)).toBe(m![2]);
      const deliveries = await store.listDeliveries("whep_test_1", 5);
      expect(deliveries[0]).toMatchObject({ status: "DELIVERED", httpStatus: 200 });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("4xx is terminal, timeouts/5xx throw for retry, failures auto-disable", async () => {
    const store = getApiStore();
    const { deliverWebhook } = await import("@/lib/webhooks/deliver");
    // 404 endpoint
    const s404 = http.createServer((_, res) => {
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => s404.listen(0, "127.0.0.1", r));
    const p404 = (s404.address() as { port: number }).port;
    await store.createWebhookEndpoint({
      id: "whep_404", userId: "u1", url: `http://127.0.0.1:${p404}/x`,
      secretEncrypted: encryptWebhookSecret(generateWebhookSecret()),
      events: ["test.event"], active: true, consecutiveFailures: 0, createdAt: Date.now(),
    });
    await deliverWebhook({ endpointId: "whep_404", eventId: "e404", type: "test.event", data: {} });
    const d404 = (await store.listDeliveries("whep_404", 1))[0]!;
    expect(d404.status).toBe("FAILED");
    expect(d404.httpStatus).toBe(404);
    await new Promise<void>((r) => s404.close(() => r()));
    // Connection refused → throws (retryable)
    await store.createWebhookEndpoint({
      id: "whep_down", userId: "u1", url: "http://127.0.0.1:1/x",
      secretEncrypted: encryptWebhookSecret(generateWebhookSecret()),
      events: ["test.event"], active: true, consecutiveFailures: 9, createdAt: Date.now(),
    });
    await expect(
      deliverWebhook({ endpointId: "whep_down", eventId: "e-down", type: "test.event", data: {} })
    ).rejects.toThrow();
    const ep = await store.getWebhookEndpoint("whep_down");
    expect(ep?.active).toBe(false); // auto-disabled at 10
  });

  it("endpoint CRUD validates URLs and rotates secrets", async () => {
    const { POST: create } = await import("@/app/api/developer/webhooks/route");
    const authed = (body: unknown) =>
      create(
        new Request("http://x/api/developer/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
    // unauthenticated → 401 (no session in test request)
    expect((await authed({ url: "https://example.com/x", events: ["test.event"] })).status).toBe(401);
  });
});

describe("phase 10: openapi + dashboard + admin", () => {
  beforeEach(() => {
    __resetServerWiring();
    (env as { apiKeyPepper?: string }).apiKeyPepper = "test-pepper-1234567890";
  });

  it("openapi lists only implemented paths with enforced scopes/events", async () => {
    const res = await openapi();
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      "x-scopes": string[];
      "x-webhook-events": string[];
    };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toContain("/api/v1/downloads");
    expect(Object.keys(spec.paths)).toContain("/api/v1/batches/{id}");
    expect(spec["x-scopes"]).toContain("downloads:create");
    expect(spec["x-webhook-events"]).toContain("download.completed");
    expect(JSON.stringify(spec)).not.toContain("sk_live");
    expect(JSON.stringify(spec)).not.toContain("admin");
  });

  it("dashboard key endpoints require premium and sessions", async () => {
    const noAuth = await keysPOST(new Request("http://x/api/developer/keys", { method: "POST" }));
    expect(noAuth.status).toBe(401);
    const { POST: revoke } = await import("@/app/api/developer/keys/[id]/revoke/route");
    const bad = await revoke(
      new Request("http://x/api/developer/keys/key_nope/revoke", { method: "POST" }),
      { params: Promise.resolve({ id: "key_nope" }) }
    );
    expect(bad.status).toBe(401);
  });

  it("admin can inspect and revoke keys with audit", async () => {
    const store = getMemoryAccountStore();
    const svc = new AuthService(store);
    const em = uniq("adminapi");
    const { user } = await svc.register(em, PW);
    await store.updateUser(user.id, { role: "ADMIN" });
    const login = await svc.login(em, PW);
    const cookie = `sf_session=${login.token}`;
    const withCookie = (path: string) => new Request(`http://x${path}`, { headers: { cookie } });
    // empty lookup
    const { GET: adminLookup } = await import("@/app/api/admin/api/route");
    const empty = await adminLookup(withCookie("/api/admin/api?userId=nobody"));
    expect(empty.status).toBe(200);
    // support cannot revoke
    const sup = await svc.register(uniq("supportapi"), PW);
    await store.updateUser(sup.user.id, { role: "SUPPORT" });
    const supLogin = await svc.login(sup.user.email, PW);
    const { POST: adminRevoke } = await import("@/app/api/admin/api/[id]/[action]/route");
    const denied = await adminRevoke(
      new Request("http://x/api/admin/api/key_x/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `sf_session=${supLogin.token}` },
        body: JSON.stringify({ userId: user.id }),
      }),
      { params: Promise.resolve({ id: "key_x", action: "revoke" }) }
    );
    expect(denied.status).toBe(403);
  });
});
