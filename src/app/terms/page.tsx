import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — SnapFlow",
  description:
    "Acceptable use, user responsibility for third-party content, availability, and limitations of the SnapFlow downloader.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Terms</h1>
      <div className="mt-4 space-y-4 text-sm leading-6 text-(--color-ink-700)">
        <h2 className="text-base font-bold text-(--color-ink-950)">Acceptable use</h2>
        <p>
          Use SnapFlow only for content you have the right to save. Do not use the service to
          infringe copyrights, harass others, or circumvent access controls. Automated abuse,
          queue flooding, and attempts to bypass rate limits or access other users&apos; jobs
          are prohibited.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Third-party content</h2>
        <p>
          Media belongs to its creators and is subject to TikTok&apos;s terms and applicable
          law. You are responsible for complying with those terms and for how you reuse
          downloaded media. SnapFlow is not affiliated with TikTok.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Availability and limits</h2>
        <p>
          The service is provided as-is, without guarantees of availability, speed, or
          successful processing of any particular link. Downloads are rate-limited, files are
          temporary and expire automatically, and limits may change to protect the service.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Accounts and subscriptions</h2>
        <p>
          Accounts are optional for basic downloads. Free accounts receive higher daily
          limits than guests; Premium subscriptions raise limits further and grant queue
          priority. Subscriptions renew automatically until canceled; canceling takes effect
          at the end of the paid period, after which Free limits apply. Payments are handled
          by our payment provider — we never see card details.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, SnapFlow is not liable for indirect or
          consequential damages arising from use of the service. This page is a plain-language
          summary, not legal advice.
        </p>
      </div>
    </main>
  );
}
