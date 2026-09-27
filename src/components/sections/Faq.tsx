"use client";

import { useState } from "react";
import { FAQ_ITEMS } from "@/content/faq";

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24">
      <p className="text-xs font-bold tracking-[0.18em] text-(--color-accent-600) uppercase">FAQ</p>
      <h2 id="faq-title" className="mt-2 text-2xl font-bold tracking-tight text-(--color-ink-950) sm:text-3xl">
        Questions, answered
      </h2>
      <div className="mt-6 divide-y divide-(--color-border) rounded-2xl border border-(--color-border) bg-(--color-surface)">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-(--color-ink-950)"
              >
                {item.q}
                <span aria-hidden="true" className="text-(--color-muted)">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen ? (
                <p id={`faq-panel-${i}`} className="px-5 pb-5 text-sm leading-6 text-(--color-ink-700)">
                  {item.a}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
