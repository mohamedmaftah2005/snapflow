import type { Metadata } from "next";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Contact — SnapFlow",
  description: "Contact SnapFlow with questions, bug reports, or abuse notices.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Contact</h1>
      <p className="mt-3 text-sm leading-6 text-(--color-ink-700)">
        Questions, bug reports, or abuse notices:{" "}
        <a className="font-semibold text-(--color-accent-600) hover:underline" href={`mailto:${siteConfig.supportEmail}`}>
          {siteConfig.supportEmail}
        </a>
        . For failed downloads, include the link you tried, what happened, and
        the approximate time — and if you have one, the request or job ID from
        your history page. We never ask for your password or API key secret.
      </p>
    </main>
  );
}
