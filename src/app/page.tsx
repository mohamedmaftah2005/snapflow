import dynamic from "next/dynamic";
import DownloaderCard from "@/components/downloader/DownloaderCard";
import ExperimentCta from "@/components/growth/ExperimentCta";
import HowItWorks from "@/components/sections/HowItWorks";
import SupportedPlatforms from "@/components/sections/SupportedPlatforms";
import Features from "@/components/sections/Features";
import ResponsibleUse from "@/components/sections/ResponsibleUse";
import AdSlot from "@/components/ads/AdSlot";
import JsonLd, { webAppSchema, websiteSchema } from "@/components/seo/JsonLd";
import { siteConfig } from "@/lib/config/site";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://snapflow.app";

// Below the fold: excluded from the initial homepage JS bundle.
const Faq = dynamic(() => import("@/components/sections/Faq"));

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 overflow-x-clip px-4 pb-16 sm:px-6">
      <JsonLd data={websiteSchema(base, siteConfig.name, siteConfig.description)} />
      <JsonLd data={webAppSchema(base, siteConfig.name, siteConfig.description)} />
      <section aria-labelledby="hero-title" className="relative mx-auto max-w-3xl pt-10 text-center sm:pt-16">
        <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-x-[-50vw] top-[-4rem] bottom-[-9rem] -z-10" />
        <p className="anim-fade-up anim-delay-1 inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-xs font-semibold text-(--color-ink-700) shadow-sm">
          <span aria-hidden="true" className="size-2 rounded-full bg-(--color-accent-600)" />
          {siteConfig.tagline} · no account needed
        </p>
        <h1
          id="hero-title"
          className="anim-fade-up anim-delay-2 mt-5 text-4xl font-extrabold tracking-tight text-(--color-ink-950) sm:text-6xl"
        >
          Save TikTok videos.
          <span className="block bg-gradient-to-r from-(--color-accent-600) to-[#b794f6] bg-clip-text text-transparent">Simply.</span>
        </h1>
        <div className="anim-fade-up anim-delay-3">
          <ExperimentCta />
        </div>
      </section>

      <div id="download" className="anim-fade-up anim-delay-4 mx-auto mt-8 max-w-2xl scroll-mt-24">
        <DownloaderCard />
      </div>

      <div className="mx-auto mt-8 max-w-2xl">
        <AdSlot placement="hero-bottom" />
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-12">
        <HowItWorks />
        <SupportedPlatforms />
        <AdSlot placement="content-middle" />
        <Features />
        <Faq />
        <ResponsibleUse />
      </div>
    </main>
  );
}
