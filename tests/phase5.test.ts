import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { faqSchema, webAppSchema, websiteSchema } from "@/components/seo/JsonLd";
import { FAQ_ITEMS } from "@/content/faq";
import { GUIDES } from "@/content/guides";
import { __resetAnalytics, getProvider, setProvider, track, type AnalyticsEvent } from "@/lib/analytics";
import { publicFlags } from "@/lib/config/features";
import { canUse, getPlanForRequest, PLANS } from "@/lib/billing/plans";

describe("phase 5: seo, analytics, growth", () => {
  it("sitemap lists only public pages (no api/jobs/tmp)", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://snapflow.app/");
    expect(urls).toContain("https://snapflow.app/how-it-works");
    expect(urls).toContain("https://snapflow.app/faq");
    for (const g of GUIDES) expect(urls).toContain(`https://snapflow.app/guides/${g.slug}`);
    for (const u of urls) {
      expect(u).not.toContain("/api/");
      expect(u).not.toContain("jobId");
      expect(u).not.toContain("/admin");
    }
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("robots allows public pages and disallows internal routes", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const flat = JSON.stringify(rules);
    expect(flat).toContain("/api/");
    expect(r.sitemap).toContain("sitemap.xml");
  });

  it("JSON-LD schemas are valid and honest (no fake ratings)", () => {
    for (const schema of [websiteSchema("https://snapflow.app", "SnapFlow", "d"), webAppSchema("https://snapflow.app", "SnapFlow", "d"), faqSchema(FAQ_ITEMS)]) {
      const json = JSON.stringify(schema);
      expect(() => JSON.parse(json)).not.toThrow();
      expect(json).not.toContain("aggregateRating");
      expect(json).not.toContain("review");
    }
    const faq = faqSchema(FAQ_ITEMS) as { mainEntity: unknown[] };
    expect(faq.mainEntity.length).toBe(FAQ_ITEMS.length);
  });

  it("FAQ content is unique (no near-duplicate spam)", () => {
    const qs = FAQ_ITEMS.map((i) => i.q);
    expect(new Set(qs).size).toBe(qs.length);
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(10);
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe("analytics", () => {
    const OLD_ENV = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS;
    beforeEach(() => {
      __resetAnalytics();
      process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "true";
      vi.stubGlobal("window", undefined);
    });
    afterEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = OLD_ENV;
      __resetAnalytics();
      vi.unstubAllGlobals();
    });

    it("drops events without browser consent", () => {
      const calls: AnalyticsEvent[] = [];
      setProvider({ name: "test", track: (e) => void calls.push(e) });
      track("download_started", { provider: "tiktok" });
      expect(calls).toEqual([]);
    });

    it("never forwards URLs or unknown props to providers", () => {
      const seen: unknown[] = [];
      const store: Record<string, string> = {};
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => void (store[k] = v),
        },
      });
      store["snapflow-consent"] = '{"analytics":true}';
      setProvider({ name: "test", track: (_e, p) => void seen.push(p) });
      const hostile = { url: "https://www.tiktok.com/@u/video/1", token: "secret" };
      track("download_completed", { provider: "tiktok", ...(hostile as unknown as { durationMs?: number }) });
      expect(seen).toHaveLength(1);
      expect(JSON.stringify(seen[0])).not.toContain("tiktok.com/@u");
      expect(JSON.stringify(seen[0])).not.toContain("secret");
    });

    it("fires page_view once per path (no duplicates)", () => {
      const calls: string[] = [];
      const store: Record<string, string> = { "snapflow-consent": '{"analytics":true}' };
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => void (store[k] = v),
        },
      });
      setProvider({ name: "test", track: (e, p) => void calls.push(`${e}:${p?.path}`) });
      track("page_view", { path: "/" });
      track("page_view", { path: "/" });
      track("page_view", { path: "/faq" });
      expect(calls).toEqual(["page_view:/", "page_view:/faq"]);
      expect(getProvider().name).toBe("test");
    });
  });

  it("feature flags default off and premium model is free-only", () => {
    expect(publicFlags.ads).toBe(false);
    expect(publicFlags.analytics).toBe(false);
    expect(getPlanForRequest().id).toBe("free");
    expect(canUse(PLANS.free, "apiAccess")).toBe(false);
    expect(canUse(PLANS.premium, "apiAccess")).toBe(true);
    expect(PLANS.free.dailyDownloads).toBe(20);
  });
});
