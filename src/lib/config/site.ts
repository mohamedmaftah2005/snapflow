export const siteConfig = {
  name: "SnapFlow",
  tagline: "Save public clips in seconds",
  description:
    "SnapFlow turns a public TikTok link into downloadable media in seconds. Paste, process, download — no account needed.",
  domainPlaceholder: "https://snapflow.app",
  supportEmail: "support@snapflow.app",
  links: {
    // Only populated when real destinations exist. Intentionally empty for Phase 1.
    twitter: undefined as string | undefined,
    github: undefined as string | undefined,
  },
} as const;

export type SiteConfig = typeof siteConfig;
