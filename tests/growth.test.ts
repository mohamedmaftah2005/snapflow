import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidAttributionCode, precedence } from "@/lib/growth/referrals";
import { EXPERIMENTS, assignExperiment } from "@/lib/growth/experiments";

describe("attribution codes", () => {
  it("accepts well-formed ref_/aff_ codes", () => {
    expect(isValidAttributionCode("ref_Ab12cd34")).toBe(true);
    expect(isValidAttributionCode("aff_-x_Y9z12")).toBe(true);
  });

  it("rejects malformed or hostile input", () => {
    expect(isValidAttributionCode("")).toBe(false);
    expect(isValidAttributionCode("ref_short")).toBe(false);
    expect(isValidAttributionCode("ref_toolong123")).toBe(false);
    expect(isValidAttributionCode("usr_Ab12cd34")).toBe(false);
    expect(isValidAttributionCode("ref_Ab12cd3!")).toBe(false);
    expect(isValidAttributionCode("ref_Ab12cd34 ")).toBe(false);
    expect(isValidAttributionCode("' OR 1=1 --")).toBe(false);
  });
});

describe("attribution precedence", () => {
  it("prefers a valid affiliate code over a valid referral code", () => {
    expect(precedence({ ref: "ref_Ab12cd34", aff: "aff_-x_Y9z12" })).toEqual({
      kind: "affiliate",
      code: "aff_-x_Y9z12",
    });
  });

  it("falls back to referral when the affiliate code is invalid", () => {
    expect(precedence({ ref: "ref_Ab12cd34", aff: "bogus" })).toEqual({
      kind: "referral",
      code: "ref_Ab12cd34",
    });
  });

  it("returns null when nothing valid is present", () => {
    expect(precedence({})).toEqual({ kind: null });
    expect(precedence({ ref: "nope", aff: "nope" })).toEqual({ kind: null });
  });
});

describe("experiment assignment", () => {
  it("returns control for unknown experiments", () => {
    expect(assignExperiment("does_not_exist", "user_1")).toBe("control");
  });

  it("is deterministic per subject", () => {
    const a = assignExperiment("hero_cta", "user_abc");
    const b = assignExperiment("hero_cta", "user_abc");
    expect(a).toBe(b);
  });

  it("matches the documented SHA-256 bucket rule", () => {
    // Independent re-implementation of the rule for cross-checking.
    const subjects = ["alice", "bob", "carol", "dave", "erin", "frank"];
    const def = EXPERIMENTS["hero_cta"];
    expect(def).toBeDefined();
    for (const s of subjects) {
      const h = createHash("sha256").update(`hero_cta:${s}`).digest();
      const bucket = h.readUInt16BE(0) % 100;
      const expected =
        bucket >= def!.rolloutPercent ? "control" : h[2]! % 2 === 0 ? "control" : "variant";
      expect(assignExperiment("hero_cta", s)).toBe(expected);
    }
  });

  it("splits traffic across both variants", () => {
    const results = new Set<string>();
    for (let i = 0; i < 500; i++) results.add(assignExperiment("hero_cta", `subject_${i}`));
    expect(results.has("control")).toBe(true);
    expect(results.has("variant")).toBe(true);
  });
});
