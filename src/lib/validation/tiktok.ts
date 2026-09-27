import { AppError } from "@/lib/errors";
import { assertSafeDns, assertSafeHost, parseHttpUrl } from "@/lib/validation/net";

export const TIKTOK_HOSTS = [
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
] as const;

const ALLOWED_HOSTS = new Set<string>(TIKTOK_HOSTS);
const ALLOWED_SUFFIXES = [".tiktok.com"];

export function isAllowedTikTokHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  if (h === "tiktok.com") return true;
  return ALLOWED_SUFFIXES.some((s) => h.endsWith(s));
}

export function normalizeTikTokUrl(raw: string): string {
  const parsed = parseHttpUrl(raw);
  const host = parsed.hostname.toLowerCase();
  assertSafeHost(host);
  if (!isAllowedTikTokHost(host)) throw new AppError("UNSUPPORTED_URL");
  if ((parsed.pathname ?? "").length < 2) throw new AppError("INVALID_URL");

  parsed.protocol = "https:";
  parsed.hash = "";
  if (host !== "vm.tiktok.com" && host !== "vt.tiktok.com") parsed.search = "";
  return parsed.toString();
}

/** Authoritative backend validation with DNS-rebinding guard. */
export async function validateTikTokUrl(raw: unknown): Promise<string> {
  if (typeof raw !== "string") throw new AppError("INVALID_URL");
  const normalized = normalizeTikTokUrl(raw);
  await assertSafeDns(new URL(normalized).hostname);
  return normalized;
}

export function supportsTikTokUrl(value: string): boolean {
  try {
    normalizeTikTokUrl(value);
    return true;
  } catch {
    return false;
  }
}
