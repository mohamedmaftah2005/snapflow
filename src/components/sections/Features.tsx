const FEATURES = [
  { title: "Fast by design", text: "Minimal page weight and a focused flow so the tool loads quickly on mobile connections." },
  { title: "Simple interface", text: "One input, one action. No installers, extensions, or confusing options." },
  { title: "Mobile friendly", text: "Touch-sized controls and layouts tested from 320px up to large desktops." },
  { title: "Careful processing", text: "Links are validated before anything runs, with clear errors instead of silent failures." },
  { title: "No account needed", text: "Paste and go. We don't ask for sign-ups for a basic download." },
  { title: "Built to scale", text: "A provider abstraction keeps TikTok support isolated for future platforms." },
];

export default function Features() {
  return (
    <section aria-labelledby="features-title">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">Why SnapFlow</p>
      <h2 id="features-title" className="mt-2 text-2xl font-bold tracking-tight text-(--color-ink-950) sm:text-3xl">
        Practical, not flashy
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.title} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm">
            <p className="font-bold text-(--color-ink-950)">{f.title}</p>
            <p className="mt-1 text-sm leading-6 text-(--color-ink-700)">{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
