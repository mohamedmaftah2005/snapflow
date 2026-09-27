import type { Metadata } from "next";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "DMCA — SnapFlow",
  description: "How rights holders can report allegedly infringing material processed by SnapFlow.",
  alternates: { canonical: "/dmca" },
};

export default function DmcaPage() {
  const mail = `mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent("DMCA takedown notice")}`;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Copyright (DMCA)</h1>
      <p className="mt-3 text-sm leading-6 text-(--color-ink-700)">
        SnapFlow only processes publicly accessible media and does not host a
        content library — files are temporary (about 30 minutes) and created
        per request. If you believe content processed through SnapFlow
        infringes your copyright, email our designated contact at{" "}
        <a className="font-semibold text-(--color-accent-600) hover:underline" href={mail}>
          {siteConfig.supportEmail}
        </a>{" "}
        with:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-(--color-ink-700)">
        <li>Identification of the copyrighted work and proof you own it or may act for the owner.</li>
        <li>The exact URL you submitted to SnapFlow and the date/time of the request.</li>
        <li>Your name, address, and email so we can respond.</li>
        <li>
          A statement that you have a good-faith belief the use is unauthorized, and — under
          penalty of perjury — that your notice is accurate.
        </li>
      </ul>
      <p className="mt-3 text-sm leading-6 text-(--color-ink-700)">
        Valid notices are reviewed promptly; repeat infringers lose their
        accounts. If your content was removed by mistake, reply with a
        counter-notice containing the same identification plus your consent to
        your local jurisdiction, and we will review it. This page describes
        our process, not legal advice. Jurisdiction-specific review by counsel
        is still required before launch in each market.
      </p>
    </main>
  );
}
