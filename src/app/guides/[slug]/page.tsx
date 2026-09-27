import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import { GUIDES, getGuide } from "@/content/guides";

export function generateStaticParams(): { slug: string }[] {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide not found" };
  return {
    title: `${guide.title} — SnapFlow`,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: { title: guide.title, description: guide.description, url: `/guides/${guide.slug}`, type: "article" },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://snapflow.app";
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-10 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description,
          dateModified: guide.updated,
          mainEntityOfPage: `${base}/guides/${guide.slug}`,
          author: { "@type": "Organization", name: "SnapFlow" },
        }}
      />
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">
        Guide · updated {guide.updated}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-(--color-ink-950) sm:text-4xl">
        {guide.title}
      </h1>
      <p className="mt-3 text-base leading-7 text-(--color-ink-700)">{guide.description}</p>
      {guide.sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-xl font-bold text-(--color-ink-950)">{s.heading}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="mt-2 text-sm leading-6 text-(--color-ink-700)">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="mt-8 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-sm leading-6 text-(--color-ink-700)">
        Ready to try it?{" "}
        <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/#download">
          Open the downloader
        </Link>{" "}
        or browse the <Link className="font-semibold text-(--color-accent-600) hover:underline" href="/faq">FAQ</Link>.
      </p>
    </main>
  );
}
