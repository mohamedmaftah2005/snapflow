"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { isValidAttributionCode } from "@/lib/growth/codes";

/**
 * Stores ref/aff attribution cookies (30d, Lax). Server re-validates
 * everything at registration; these cookies are hints, never trust.
 */
export default function Attribution() {
  const params = useSearchParams();

  useEffect(() => {
    const ref = params.get("ref");
    const aff = params.get("aff");
    const days = 30;
    const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toUTCString();
    if (aff && isValidAttributionCode(aff)) {
      document.cookie = `sf_aff=${encodeURIComponent(aff)}; Path=/; Max-Age=${days * 24 * 3600}; SameSite=Lax; Expires=${expires}`;
    } else if (ref && isValidAttributionCode(ref)) {
      document.cookie = `sf_ref=${encodeURIComponent(ref)}; Path=/; Max-Age=${days * 24 * 3600}; SameSite=Lax; Expires=${expires}`;
    }
  }, [params]);

  return null;
}
