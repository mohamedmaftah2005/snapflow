import dns from "node:dns/promises";
import net from "node:net";
import { env } from "@/lib/config/env";
import { isBlockedIpLiteral } from "@/lib/validation/net";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 64 * 1024;

/**
 * SSRF-safe outbound fetch for webhook delivery. Every hop (initial URL
 * and each redirect) is revalidated: https-only (http allowed for
 * localhost in non-production), no credentials, hostname must not resolve
 * to blocked ranges, redirect count capped, strict timeout, capped body.
 */
export interface SafeFetchResult {
  status: number;
  body: string;
}

export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid webhook URL");
  }
  const isLocalhost =
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    u.hostname === "127.0.0.1" ||
    u.hostname === "::1";
  const allowHttp = process.env.NODE_ENV !== "production" && isLocalhost;
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) {
    throw new Error("Webhook URL must use HTTPS");
  }
  if (u.username || u.password) throw new Error("Webhook URL must not contain credentials");
  if (u.port && !/^\d{1,5}$/.test(u.port)) throw new Error("Invalid webhook URL port");
  // Private-range blocking is the production default. The allow-private
  // escape hatch exists ONLY for local dev/tests (env-gated, default off).
  if (!env.webhookAllowPrivate) {
    await assertResolvesSafe(u.hostname);
  } else {
    await assertResolvable(u.hostname);
  }
  return u;
}

async function assertResolvable(hostname: string): Promise<void> {
  if (net.isIP(hostname)) return;
  try {
    await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Webhook host does not resolve");
  }
}

async function assertResolvesSafe(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedIpLiteral(hostname)) throw new Error("Webhook target is not allowed");
    return;
  }
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Webhook host does not resolve");
  }
  for (const a of addrs) {
    if (isBlockedIpLiteral(a.address)) throw new Error("Webhook target is not allowed");
  }
}

export async function safeFetchWebhook(
  rawUrl: string,
  init: { method: string; headers: Record<string, string>; body: string }
): Promise<SafeFetchResult> {
  let current = (await assertSafeWebhookUrl(rawUrl)).toString();
  let status = 0;
  let text = "";
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), env.webhookTimeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        redirect: "manual",
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(`Delivery failed: ${err instanceof Error ? err.name : "network"}`);
    } finally {
      clearTimeout(timer);
    }
    status = res.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const loc = res.headers.get("location");
      await res.arrayBuffer().catch(() => undefined);
      if (!loc) throw new Error("Redirect without location");
      if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");
      // Revalidate EVERY redirect target (redirect-to-private-IP blocked here).
      current = (await assertSafeWebhookUrl(new URL(loc, current).toString())).toString();
      continue;
    }
    const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    text = Buffer.from(buf.slice(0, MAX_BODY_BYTES)).toString("utf8");
    break;
  }
  return { status, body: text };
}
