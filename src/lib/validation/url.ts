import type { ValidationResult } from "@/types/downloader";

const SUPPORTED_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

function stripWww(host: string): string {
  return host.toLowerCase().startsWith("www.")
    ? host.toLowerCase().slice(4)
    : host.toLowerCase();
}

export function isValidUrl(value: string): boolean {
  if (!value || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSupportedTikTokUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase();
  // Reject localhost / private-looking hosts explicitly.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("172.")
  ) {
    return false;
  }

  if (SUPPORTED_HOSTS.has(host) || SUPPORTED_HOSTS.has(stripWww(host))) {
    return parsed.pathname.length >= 2; // require at least "/x"
  }
  // Allow bare tiktok.com subpaths like https://tiktok.com/@user/video/123
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return true;
  return false;
}

export function normalizeTikTokUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!isValidUrl(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    // Keep query only for short links (vm/vt) where ID may live in path anyway;
    // drop tracking params for canonical links to reduce surface.
    if (parsed.hostname.toLowerCase() !== "vm.tiktok.com" && parsed.hostname.toLowerCase() !== "vt.tiktok.com") {
      parsed.search = "";
    }
    // Force https
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validateTikTokUrlInput(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, errorCode: "INVALID_URL", message: "Paste a TikTok link to continue." };
  }
  if (!isValidUrl(trimmed)) {
    return { ok: false, errorCode: "INVALID_URL", message: "That doesn't look like a valid URL. Check the link and try again." };
  }
  if (!isSupportedTikTokUrl(trimmed)) {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_URL",
      message: "This link isn't supported yet. Only public TikTok links are supported.",
    };
  }
  const normalizedUrl = normalizeTikTokUrl(trimmed);
  if (!normalizedUrl) {
    return { ok: false, errorCode: "INVALID_URL", message: "Please check the link and try again." };
  }
  return { ok: true, normalizedUrl };
}
