export interface FaqItem {
  q: string;
  a: string;
}

/** Single source of truth for FAQ content (homepage, /faq, JSON-LD). */
export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "What is SnapFlow?",
    a: "SnapFlow is a web tool that prepares publicly available TikTok media from a link you paste, so you can save it to your device. No account or software installation is needed.",
  },
  {
    q: "How do I download a TikTok video?",
    a: "Paste a public TikTok URL into the box on the homepage, press Download, wait while the job is processed, then choose one of the offered files. See the step-by-step walkthrough on the How it works page.",
  },
  {
    q: "What TikTok links are supported?",
    a: "Public video links from tiktok.com and its official short domains (vm.tiktok.com, vt.tiktok.com, m.tiktok.com). Private, login-walled, age-restricted, or deleted posts cannot be processed.",
  },
  {
    q: "Can I use SnapFlow on Android and iPhone?",
    a: "Yes. The layout is mobile-first: the input and button stay full-width and touch-friendly on small screens, and downloads use your browser's normal save flow on both Android and iOS.",
  },
  {
    q: "Why did my download fail?",
    a: "Common reasons: the post was deleted or made private, the link was mistyped, the video is region-restricted, TikTok changed its pages, or our service is temporarily busy. Check the link and try once more before reporting a problem.",
  },
  {
    q: "Why does a TikTok video sometimes become unavailable?",
    a: "Creators can delete videos, switch them to private, or accounts can be removed. TikTok also limits some content by region or age. SnapFlow can only process what is publicly accessible at the time.",
  },
  {
    q: "How long are processed files available?",
    a: "Processed files are temporary by design and expire automatically after a short window (currently 30 minutes). Download them promptly; expired links require starting a new download.",
  },
  {
    q: "Do I need an account?",
    a: "No. The downloader works without sign-up, and we do not sell personal data. Basic download jobs need no account now or in the planned free tier.",
  },
  {
    q: "Is SnapFlow affiliated with TikTok?",
    a: "No. SnapFlow is an independent tool and is not affiliated with, endorsed by, or sponsored by TikTok.",
  },
  {
    q: "Can I download content I do not own?",
    a: "Only save or reuse content when you have the creator's permission or the rights to do so, and follow TikTok's terms and your local law. You are responsible for how you use downloaded media.",
  },
];
