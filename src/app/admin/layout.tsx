import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Admin — SnapFlow",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/batches", label: "Batches" },
  { href: "/admin/queues", label: "Queues" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/storage", label: "Storage" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/abuse", label: "Abuse" },
  { href: "/admin/api", label: "API" },
  { href: "/admin/feature-flags", label: "Flags" },
  { href: "/admin/audit-logs", label: "Audit" },
  { href: "/admin/system", label: "System" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 lg:flex-row lg:gap-6">
      <aside className="mb-4 lg:mb-0 lg:w-52 lg:shrink-0">
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface) p-2 lg:sticky lg:top-20 lg:flex-col">
          <p className="hidden px-3 pt-2 text-xs font-bold tracking-widest text-(--color-muted) uppercase lg:block">
            Operations
          </p>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-(--color-ink-700) hover:bg-(--color-accent-50)"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
