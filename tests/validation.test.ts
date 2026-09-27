import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  normalizeTikTokUrl,
  supportsTikTokUrl,
  validateTikTokUrl,
} from "@/lib/validation/tiktok";

describe("TikTok URL validation", () => {
  it("1. accepts a valid TikTok URL and normalizes to https", () => {
    const out = normalizeTikTokUrl("http://www.tiktok.com/@user/video/123#frag");
    expect(out.startsWith("https://")).toBe(true);
    expect(out).not.toContain("#frag");
    expect(supportsTikTokUrl("https://www.tiktok.com/@user/video/123")).toBe(true);
  });

  it("2. rejects an invalid URL", () => {
    expect(() => normalizeTikTokUrl("not a url")).toThrowError(AppError);
    try {
      normalizeTikTokUrl("not a url");
    } catch (e) {
      expect((e as AppError).code).toBe("INVALID_URL");
    }
  });

  it("3. rejects an unsupported domain", () => {
    expect(() => normalizeTikTokUrl("https://example.com/video/123")).toThrowError(AppError);
    try {
      normalizeTikTokUrl("https://example.com/video/123");
    } catch (e) {
      expect((e as AppError).code).toBe("UNSUPPORTED_URL");
    }
  });

  it("4. rejects unsupported protocols", () => {
    for (const u of ["file:///etc/passwd", "ftp://tiktok.com/x", "javascript:alert(1)", "data:text/plain,hi"]) {
      expect(supportsTikTokUrl(u)).toBe(false);
    }
    expect(() => normalizeTikTokUrl("file:///etc/passwd")).toThrowError(AppError);
  });

  it("5. rejects localhost URLs", () => {
    for (const u of ["http://localhost:3000/x", "http://127.0.0.1/video/1", "http://0.0.0.0/x"]) {
      expect(supportsTikTokUrl(u)).toBe(false);
    }
  });

  it("6. rejects private IP literals", () => {
    for (const u of [
      "http://10.0.0.5/video/1",
      "http://192.168.1.10/x",
      "http://172.16.5.4/x",
      "http://169.254.169.254/latest/meta-data/",
    ]) {
      expect(supportsTikTokUrl(u)).toBe(false);
    }
    expect(() => normalizeTikTokUrl("http://192.168.0.1/admin")).toThrowError(AppError);
  });

  it("7. rejects malformed / non-string request input", async () => {
    await expect(validateTikTokUrl(undefined)).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(validateTikTokUrl(123)).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(validateTikTokUrl("")).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});
