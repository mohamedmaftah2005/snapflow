import type { Metadata } from "next";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Privacy — SnapFlow",
  description:
    "How SnapFlow handles download jobs, temporary media, logs, and optional privacy-conscious analytics.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold text-(--color-ink-950)">Privacy</h1>
      <div className="mt-4 space-y-4 text-sm leading-6 text-(--color-ink-700)">
        <p>
          {siteConfig.name} processes the TikTok link you paste in order to prepare a download.
          No account is required, and we do not sell personal data.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Download jobs</h2>
        <p>
          Each request creates a job record (status, source link, technical metadata such as
          duration and file size). Job records for completed downloads are kept until the file
          expires; records for failed or expired jobs are deleted after a limited retention
          period (currently 7 days).
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Temporary media</h2>
        <p>
          Generated media files are temporary by design and expire automatically (currently
          after 30 minutes), after which they are deleted from storage. We do not keep a
          permanent archive of your downloads. Before a file is served, embedded container
          metadata (titles, encoder tags, timestamps) is removed with a lossless remux —
          the picture and sound are untouched.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Analytics</h2>
        <p>
          When enabled, we measure anonymous usage events — page views, download starts,
          completions, failures, and expirations — with only technical properties (provider,
          status, error code, duration). We never collect pasted URLs, downloaded content,
          passwords, or tokens. Analytics run only after you accept the on-site consent
          banner, and you can decline with no loss of functionality. No analytics or
          advertising cookies are set; consent is stored locally in your browser.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Accounts</h2>
        <p>
          Creating an account is optional. If you register, we store your email address, an
          irreversibly hashed password (never plaintext), and your display name. Sessions are
          kept server-side and expire after 30 days; signing out invalidates them immediately.
          You can change your name and password or delete your account from Settings — deletion
          anonymizes your profile while retaining anonymous billing records where accounting
          rules require it.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Subscriptions and billing</h2>
        <p>
          Card details are processed exclusively by our payment provider (Stripe) on their
          hosted pages — we never see or store card numbers. We keep subscription state
          (plan, status, billing period) synchronized through verified provider webhooks.
          Canceling takes effect at the end of the paid period.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Download history</h2>
        <p>
          Signed-in users can review recent download metadata (title, provider, date, status)
          on their dashboard. History entries may outlive the temporary media files, which
          still expire on their normal schedule.
        </p>
        <h2 className="pt-2 text-base font-bold text-(--color-ink-950)">Logs and security</h2>
        <p>
          Operational logs (request/job identifiers, timestamps, error codes) are kept for
          debugging and abuse prevention. URLs in logs are stripped of query strings and
          credentials. Contact {siteConfig.supportEmail} with privacy questions.
        </p>
      </div>
    </main>
  );
}
