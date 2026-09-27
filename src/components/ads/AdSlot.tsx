import { publicFlags } from "@/lib/config/features";

export type AdPlacement =
  | "hero-bottom"
  | "content-middle"
  | "result-bottom"
  | "footer-top";

/**
 * Ad placeholder. Renders nothing until an ad provider is integrated.
 * When enabled without a provider, reserves its space (no layout shift)
 * with a clearly-labeled development box — never a fake download button.
 */
export default function AdSlot({ placement }: { placement: AdPlacement }) {
  if (!publicFlags.ads) return null;
  return (
    <div
      role="complementary"
      aria-label={`Advertisement placeholder (${placement})`}
      className="mx-auto flex min-h-[120px] w-full max-w-2xl items-center justify-center rounded-2xl border border-dashed border-(--color-border) bg-(--color-surface)/60 text-xs font-medium text-(--color-muted)"
    >
      Ad space · {placement} (no provider configured)
    </div>
  );
}
