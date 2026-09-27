import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "@/lib/errors";

/**
 * Generic network safety layer shared by all providers.
 * Providers define their own allowed domains; everything here rejects.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null || !Number.isFinite(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

const BLOCKED_V4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
];

export function isBlockedIpLiteral(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    return BLOCKED_V4_CIDRS.some((c) => inCidr(ip, c));
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    // IPv4-mapped/embedded (::ffff:10.0.0.1): judge by the embedded v4.
    const embedded = v.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (embedded) return BLOCKED_V4_CIDRS.some((c) => inCidr(embedded[1] as string, c));
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7
    if (v.startsWith("fe80") || v.startsWith("fe90") || v.startsWith("fea") || v.startsWith("feb")) return true; // fe80::/10
    if (v.startsWith("ff")) return true; // multicast
    return false;
  }
  return false;
}

/** Rejects localhost names and blocked IP literals. Throws UNSUPPORTED_URL. */
export function assertSafeHost(host: string): void {
  const h = host.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost")) {
    throw new AppError("UNSUPPORTED_URL");
  }
  if (net.isIP(h) && isBlockedIpLiteral(h)) throw new AppError("UNSUPPORTED_URL");
}

/**
 * DNS-rebinding guard: reject hostnames resolving to blocked addresses.
 * DNS failure maps to VIDEO_UNAVAILABLE (never leak resolver detail).
 */
export async function assertSafeDns(host: string): Promise<void> {
  if (net.isIP(host)) {
    if (isBlockedIpLiteral(host)) throw new AppError("UNSUPPORTED_URL");
    return;
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const a of addrs) {
      if (isBlockedIpLiteral(a.address)) throw new AppError("UNSUPPORTED_URL");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("VIDEO_UNAVAILABLE", "Could not resolve link host");
  }
}

/** Shared pre-checks: parseable http(s) URL, no userinfo. Returns parsed URL. */
export function parseHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new AppError("INVALID_URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError("INVALID_URL");
  }
  if (parsed.username || parsed.password) throw new AppError("INVALID_URL");
  return parsed;
}
