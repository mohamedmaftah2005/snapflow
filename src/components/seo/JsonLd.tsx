interface JsonLdProps {
  data: Record<string, unknown>;
}

/** Renders validated JSON-LD. Throws on unserializable input (fail loud in build). */
export default function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  JSON.parse(json) as unknown; // validates
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function websiteSchema(base: string, name: string, description: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    description,
    url: `${base}/`,
  };
}

export function webAppSchema(
  base: string,
  name: string,
  description: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: `${base}/`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    // No offers/price here: the product has both a free tier and a paid
    // plan, and a single price "0" misrepresents the paid tier.
    // See /pricing for the authoritative plan breakdown.
  };
}

export function faqSchema(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}
