import Link from "next/link";
import { siteConfig } from "@/lib/config/site";

export default function Footer() {
  return (
    <footer className="border-t border-(--color-border) bg-(--color-surface)">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-base font-bold text-(--color-ink-950)">{siteConfig.name}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-(--color-muted)">
            A simple tool for preparing publicly available TikTok media for offline viewing.
            Only use content you have the right to save.
          </p>
          <p className="mt-4 text-sm text-(--color-muted)">
            Contact:{" "}
            <a className="font-semibold text-(--color-accent-600) hover:underline" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-sm font-semibold text-(--color-ink-950)">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-(--color-ink-700)">
            <li><Link className="hover:underline" href="/">Home</Link></li>
            <li><Link className="hover:underline" href="/batch">Batch download</Link></li>
            <li><Link className="hover:underline" href="/how-it-works">How it works</Link></li>
            <li><Link className="hover:underline" href="/faq">FAQ</Link></li>
            <li><Link className="hover:underline" href="/pricing">Pricing</Link></li>
            <li><Link className="hover:underline" href="/guides/how-to-download-tiktok-video">Download guide</Link></li>
            <li><Link className="hover:underline" href="/guides/why-tiktok-download-fails">Why downloads fail</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p className="text-sm font-semibold text-(--color-ink-950)">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-(--color-ink-700)">
            <li><Link className="hover:underline" href="/privacy">Privacy</Link></li>
            <li><Link className="hover:underline" href="/terms">Terms</Link></li>
            <li><Link className="hover:underline" href="/dmca">DMCA</Link></li>
            <li><Link className="hover:underline" href="/contact">Contact</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-(--color-border)">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-(--color-muted) sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 {siteConfig.name}. All rights reserved.</p>
          <p>Not affiliated with TikTok. Availability depends on the source platform.</p>
        </div>
      </div>
    </footer>
  );
}
