import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/sections/Faq";
import JsonLd, { faqSchema } from "@/components/seo/JsonLd";
import { FAQ_ITEMS } from "@/content/faq";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "FAQ — SnapFlow",
  description:
    "Answers about the SnapFlow TikTok downloader: supported links, mobile use, file expiry, failures, privacy, and responsible use.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ — SnapFlow",
    description:
      "Answers about supported TikTok links, mobile use, file expiry, failures, and responsible use.",
    url: "/faq",
  },
};

export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-10 sm:px-6">
      <JsonLd data={faqSchema(FAQ_ITEMS)} />
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">
        Help center
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-(--color-ink-950) sm:text-4xl">
        Frequently asked questions
      </h1>
      <p className="mt-3 text-base leading-7 text-(--color-ink-700)">
        Everything here reflects how {siteConfig.name} actually works today. For the interactive
        tool, go to the <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/#download">downloader</Link>;
        for step-by-step instructions, see{" "}
        <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/how-it-works">How it works</Link>.
      </p>
      <div className="mt-8">
        <Faq />
      </div>
    </main>
  );
}
