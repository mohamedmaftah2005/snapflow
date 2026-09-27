export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "sf_theme";

/**
 * Pure theme resolution (unit-tested): stored choice wins, otherwise the
 * OS preference, otherwise light. Anything unrecognized falls back safely.
 */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

/** Applies the theme class. DOM-only side effect, kept out of components. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
