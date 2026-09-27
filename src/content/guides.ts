export interface Guide {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}

/** Lightweight guides — only topics the product genuinely covers. */
export const GUIDES: Guide[] = [
  {
    slug: "how-to-download-tiktok-video",
    title: "How to download a TikTok video with SnapFlow",
    description:
      "A short, accurate walkthrough: copying a public TikTok link, submitting it on SnapFlow, and saving the result on mobile and desktop.",
    updated: "2026-09-27",
    sections: [
      {
        heading: "Copy a public TikTok link",
        body: [
          "Open the TikTok app or website and find a public video. Use Share → Copy link. The link should point to tiktok.com or one of its official short domains (vm.tiktok.com, vt.tiktok.com). Private or login-walled posts will not work, because SnapFlow can only process publicly accessible media.",
        ],
      },
      {
        heading: "Paste the link on SnapFlow",
        body: [
          "Open the SnapFlow homepage and paste the link into the TikTok URL box, then press Download. The link is validated first: malformed or unsupported links are rejected immediately with a plain-language message.",
        ],
      },
      {
        heading: "Wait for processing, then save",
        body: [
          "A background job prepares the media — the page polls its status (queued, processing, almost ready) instead of showing fake percentages. When the result card appears, choose a format and save it with your browser's normal download flow. Files expire after a short window, so save them promptly.",
        ],
      },
    ],
  },
  {
    slug: "why-tiktok-download-fails",
    title: "Why a TikTok download can fail (and what to try)",
    description:
      "The real reasons SnapFlow cannot process a link — deleted or private posts, region limits, mistyped URLs, and temporary service issues — and what to check first.",
    updated: "2026-09-27",
    sections: [
      {
        heading: "The video is gone or private",
        body: [
          "The most common cause: the creator deleted the video, switched it to private, or the account was removed. Open the link in your browser while logged out — if you cannot watch it there, no downloader can process it.",
        ],
      },
      {
        heading: "The link itself is the problem",
        body: [
          "Check for a mistyped or truncated URL, extra characters from messaging apps, or a link to a profile, comment, or live stream instead of a video. Only direct public video links from tiktok.com and its official short domains are supported.",
        ],
      },
      {
        heading: "Temporary issues",
        body: [
          "TikTok changes its pages regularly, which can break extraction until the underlying tool is updated. Heavy load can also cause timeouts — wait a minute and try once more. If the same public link fails repeatedly, contact us with the link and the error shown.",
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
