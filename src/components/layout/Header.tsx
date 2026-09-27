import Link from "next/link";
import { siteConfig } from "@/lib/config/site";
import AccountNav from "./AccountNav";
import ThemeToggle from "./ThemeToggle";
import { NotificationBell } from "@/components/growth/Notifications";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-(--color-border) bg-(--color-surface)/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${siteConfig.name} home`}>
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-xl bg-(--color-ink-950) text-[17px] font-extrabold text-(--color-paper) shadow-sm"
          >
            S
          </span>
          <span className="text-[17px] font-bold tracking-tight text-(--color-ink-950)">
            {siteConfig.name}
          </span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-7 text-sm font-medium text-(--color-ink-700) sm:flex">
          <Link className="transition-colors hover:text-(--color-ink-950)" href="/how-it-works">
            How it works
          </Link>
          <Link className="transition-colors hover:text-(--color-ink-950)" href="/faq">
            FAQ
          </Link>
          <Link className="transition-colors hover:text-(--color-ink-950)" href="/pricing">
            Pricing
          </Link>
          <AccountNav />
          <NotificationBell />
          <ThemeToggle />
          <Link
            href="/#download"
            className="rounded-full bg-(--color-ink-950) px-4 py-2 text-(--color-paper) transition-transform hover:-translate-y-px"
          >
            Try it now
          </Link>
        </nav>
        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <Link
            href="/#download"
            className="rounded-full bg-(--color-ink-950) px-4 py-2 text-sm font-semibold text-(--color-paper)"
          >
            Start
          </Link>
        </div>
      </div>
      <nav aria-label="Mobile" className="border-t border-(--color-border) sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-2 text-sm font-medium text-(--color-ink-700)">
          <Link className="shrink-0 py-1" href="/how-it-works">How it works</Link>
          <Link className="shrink-0 py-1" href="/faq">FAQ</Link>
          <Link className="shrink-0 py-1" href="/pricing">Pricing</Link>
          <Link className="shrink-0 py-1" href="/batch">Batch</Link>
        </div>
      </nav>
    </header>
  );
}
