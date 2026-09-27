/**
 * Client-safe attribution primitives (no server imports — safe to bundle
 * in the browser). Server-side policy (existence, ownership, status)
 * stays in lib/growth/referrals.ts and the register route.
 */
export const REF_COOKIE = "sf_ref";
export const AFF_COOKIE = "sf_aff";

export function isValidAttributionCode(v: string): boolean {
  // ref_ + 8 chars or aff_ + 8 chars, URL-safe.
  return /^(ref|aff)_[A-Za-z0-9_-]{8}$/.test(v);
}
