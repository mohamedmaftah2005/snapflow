import { getEnabledDisplayProviders } from "@/lib/providers/display-server";

export default function SupportedPlatforms() {
  const providers = getEnabledDisplayProviders();
  return (
    <section aria-labelledby="platforms-title">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">
        Supported platforms
      </p>
      <h2 id="platforms-title" className="mt-2 text-2xl font-bold tracking-tight text-(--color-ink-950) sm:text-3xl">
        What you can save
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {providers.map((p) => (
          <li key={p.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-card)">
            <p className="font-bold text-(--color-ink-950)">{p.name}</p>
            <p className="mt-1 text-sm leading-6 text-(--color-ink-700)">{p.blurb}</p>
            {p.contentTypes.length > 0 ? (
              <p className="mt-2 text-xs font-semibold tracking-wide text-(--color-muted) uppercase">
                {p.contentTypes.join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-(--color-muted)">
        Independent tool — not affiliated with or endorsed by any platform. Only
        publicly accessible content can be processed.
      </p>
    </section>
  );
}
