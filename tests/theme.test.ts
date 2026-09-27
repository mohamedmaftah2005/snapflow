import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, resolveTheme } from "@/lib/theme";

describe("theme resolution", () => {
  it("honors an explicit stored choice", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("falls back to the OS preference, then light", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("", false)).toBe("light");
    expect(resolveTheme("sepia", true)).toBe("dark");
    expect(resolveTheme("DARK", false)).toBe("light");
  });

  it("uses a stable storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("sf_theme");
  });
});
