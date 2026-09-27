import { describe, expect, it } from "vitest";
import { isCrossSiteOrigin, rejectCrossSite } from "@/lib/validation/origin";
import { PLANS, effectiveFileCapMB } from "@/lib/billing/plans";
import { env } from "@/lib/config/env";
import { MemoryAccountStore } from "@/lib/accounts/memory";
import { AuthService } from "@/lib/auth/service";
import { __setEmailService } from "@/lib/email";
import { applyPaymentEvent } from "@/lib/billing/subscriptions";
import { getAccountStore, getGrowthStore } from "@/lib/server";
import { runCampaign } from "@/lib/growth/campaigns";
import { maintenanceMode, setFlag, __resetFlagCache } from "@/lib/admin/flags";
import { requireApiKey } from "@/app/api/v1/_auth";
import { POST as resetPOST } from "@/app/api/auth/reset/route";

const PW = "correct-horse-9-battery";
let n = 0;
const uniq = (p: string): string => `${p}-${Date.now()}-${n++}@example.com`;

describe("phase 15: CSRF same-origin check", () => {
  it("allows same-origin and headerless requests, rejects cross-site", () => {
    expect(isCrossSiteOrigin("https://app.example/api/download", "https://app.example", null)).toBe(false);
    expect(isCrossSiteOrigin("https://app.example/api/download", null, "https://app.example/login")).toBe(false);
    expect(isCrossSiteOrigin("https://app.example/api/download", null, null)).toBe(false);
    expect(isCrossSiteOrigin("https://app.example/api/download", "https://evil.example", null)).toBe(true);
    expect(isCrossSiteOrigin("https://app.example/api/download", null, "https://evil.example/x")).toBe(true);
    expect(isCrossSiteOrigin("https://app.example/api/download", ":::", null)).toBe(true);
  });

  it("rejectCrossSite returns 403 only for cross-site POSTs", () => {
    const same = new Request("https://app.example/api/download", {
      method: "POST",
      headers: { origin: "https://app.example" },
    });
    expect(rejectCrossSite(same)).toBeNull();
    const evil = new Request("https://app.example/api/download", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    const res = rejectCrossSite(evil);
    expect(res?.status).toBe(403);
  });
});

describe("phase 15: pricing displays the enforced file cap", () => {
  it("effectiveFileCapMB mirrors the service min(plan, env)", () => {
    expect(effectiveFileCapMB(PLANS.free.maxFileSizeBytes, env.maxFileSizeBytes)).toBe(
      Math.round(Math.min(100 * 1024 * 1024, env.maxFileSizeBytes) / 1024 / 1024)
    );
    // Default env (100MB) caps premium's 500MB ceiling — the launch bug.
    expect(effectiveFileCapMB(PLANS.premium.maxFileSizeBytes, 100 * 1024 * 1024)).toBe(100);
    expect(effectiveFileCapMB(PLANS.premium.maxFileSizeBytes, 500 * 1024 * 1024)).toBe(500);
    expect(effectiveFileCapMB(null, env.maxFileSizeBytes)).toBe(
      Math.round(env.maxFileSizeBytes / 1024 / 1024)
    );
  });
});

describe("phase 15: resend verification", () => {
  it("re-issues for unverified accounts only", async () => {
    const store = new MemoryAccountStore();
    const svc = new AuthService(store);
    const sent: { to: string; text: string }[] = [];
    __setEmailService({ send: async (m) => void sent.push({ to: m.to, text: m.text }) });
    try {
      const { user } = await svc.register(uniq("re"), PW);
      const before = sent.length;
      expect(await svc.resendVerification(user.id)).toBe(true);
      expect(sent.length).toBe(before + 1);
      expect(sent[sent.length - 1]!.text).toContain("/verify?token=");
      expect(await svc.resendVerification("no-such-user")).toBe(false);
    } finally {
      __setEmailService({ send: async () => undefined });
    }
  });
});

describe("phase 15: reset keeps its generic contract", () => {
  it("bad token returns success:true with reset:false (UI must branch on it)", async () => {
    const req = new Request("http://x/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bogus-token", password: "new-password-9" }),
    });
    const res = await resetPOST(req);
    const body = (await res.json()) as { success: boolean; data?: { reset?: boolean } };
    expect(body.success).toBe(true);
    expect(body.data?.reset).toBe(false);
  });
});

describe("phase 15: payment.failed dunning without state rewrite", () => {
  it("fires lifecycle side-effects and leaves the subscription row alone", async () => {
    const accounts = getAccountStore();
    const email = uniq("dun");
    const svc = new AuthService(accounts);
    const { user } = await svc.register(email, PW);
    const out = await applyPaymentEvent(
      { id: `evt_dun_${Date.now()}`, type: "payment.failed", userId: user.id, planId: "premium", status: "PAST_DUE" },
      "test"
    );
    expect(out).toBe("applied");
    // No subscription row was fabricated by the failure event.
    expect(await accounts.getActiveSubscription(user.id)).toBeUndefined();
    // The user was notified through the standard channel.
    const notes = await getGrowthStore().listNotifications(user.id, 10);
    expect(notes.some((x) => x.type === "payment.failed")).toBe(true);
  });
});

describe("phase 15: kill switches", () => {
  it("api_enabled gates the public API before key auth", async () => {
    __resetFlagCache();
    try {
      await setFlag("api_enabled", false, null);
      const req = new Request("http://x/api/v1/downloads", { method: "POST" });
      const out = await requireApiKey(req, ["downloads:create"]);
      expect("error" in out).toBe(true);
      if ("error" in out) expect(out.error.status).toBe(503);
    } finally {
      await setFlag("api_enabled", true, null);
      __resetFlagCache();
    }
  });

  it("marketing_enabled stops campaign runs", async () => {
    __resetFlagCache();
    const growth = getGrowthStore();
    const rec = {
      id: `cmp_${Date.now()}`, name: "t", type: "announcement" as const, status: "DRAFT" as const,
      audience: "all", subject: "s", body: "b", sentCount: 0, createdAt: Date.now(),
    };
    await growth.createCampaign(rec);
    await growth.updateCampaign(rec.id, { status: "ACTIVE" });
    try {
      await setFlag("marketing_enabled", false, null);
      await expect(runCampaign(rec.id)).rejects.toThrow("Marketing is currently disabled");
    } finally {
      await setFlag("marketing_enabled", true, null);
      __resetFlagCache();
    }
  });

  it("maintenance_mode round-trips through the flag store", async () => {
    __resetFlagCache();
    try {
      expect(await maintenanceMode()).toBe(false);
      await setFlag("maintenance_mode", true, null);
      expect(await maintenanceMode()).toBe(true);
    } finally {
      await setFlag("maintenance_mode", false, null);
      __resetFlagCache();
    }
  });
});
