import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "How it works — SnapFlow",
  description:
    "Paste a public TikTok link, SnapFlow validates and processes it in the background, then you save the result. Works on mobile and desktop, no account needed.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How it works — SnapFlow",
    description:
      "Paste a link, background processing prepares the media, then you save the result. No account needed.",
    url: "/how-it-works",
  },
};

const STEPS = [
  {
    n: "01",
    title: "Paste a public TikTok link",
    body: "Copy the link from the TikTok app or site (Share → Copy link) and paste it into the downloader. Links from tiktok.com and its official short domains (vm.tiktok.com, vt.tiktok.com, m.tiktok.com) are supported. The link is validated before anything else happens.",
  },
  {
    n: "02",
    title: "Background processing prepares the media",
    body: "The server creates a job and a dedicated worker fetches the available public media with yt-dlp, then stores it temporarily. The page shows live job states — queued, processing, almost ready — instead of fake percentages. Most jobs finish in well under a minute.",
  },
  {
    n: "03",
    title: "Save the result to your device",
    body: "When the result card appears, choose a format and save it with your browser's normal download flow. Files expire automatically after a short window, so download them promptly. Only save content you have the right to keep.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-10 sm:px-6">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">
        Guide
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-(--color-ink-950) sm:text-4xl">
        How {siteConfig.name} works
      </h1>
      <p className="mt-3 text-base leading-7 text-(--color-ink-700)">
        Three steps, no software to install, no account to create.{" "}
        <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/#download">
          Try the downloader
        </Link>{" "}
        or read the <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/faq">FAQ</Link> for
        edge cases.
      </p>
      <ol className="mt-8 space-y-4">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 sm:p-6">
            <p className="text-xs font-bold text-(--color-muted)">{s.n}</p>
            <h2 className="mt-1 text-lg font-bold text-(--color-ink-950)">{s.title}</h2>
            <p className="mt-1 text-sm leading-6 text-(--color-ink-700)">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm leading-6 text-(--color-ink-700)">
        If a download fails, the usual causes are a deleted or private post, a mistyped link, or
        temporary load — see{" "}
        <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/guides/why-tiktok-download-fails">
          why a TikTok download can fail
        </Link>
        .
      </p>
    </main>
  );
}
