import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://snapflow.app";
  return {
    rules: [
      // Crawlers must never index job results, files, API responses,
      // or authenticated/admin surfaces (per-page noindex is the primary
      // control; this is defense in depth).
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/dashboard/", "/billing/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
