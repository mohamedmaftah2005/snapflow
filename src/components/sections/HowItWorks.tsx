const STEPS = [
  { n: "01", title: "Paste", text: "Copy a public TikTok link and paste it into the box above." },
  { n: "02", title: "Process", text: "SnapFlow validates the link and prepares the available media." },
  { n: "03", title: "Download", text: "Choose a format and save the result to your device." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-24">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">How it works</p>
      <h2 id="how-it-works-title" className="mt-2 text-2xl font-bold tracking-tight text-(--color-ink-950) sm:text-3xl">
        Three steps. No clutter.
      </h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-card)">
            <p className="text-xs font-bold text-(--color-muted)">{s.n}</p>
            <p className="mt-1 font-bold text-(--color-ink-950)">{s.title}</p>
            <p className="mt-1 text-sm leading-6 text-(--color-ink-700)">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
