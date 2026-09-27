/**
 * Client-safe provider display metadata. Display-only: the backend registry
 * is authoritative for validation, jobs, and downloads. Never inferred from
 * user input. Configure via NEXT_PUBLIC_PROVIDERS (comma-separated ids).
 */
export interface ProviderDisplay {
  id: string;
  name: string;
  blurb: string;
  contentTypes: string[];
}

const KNOWN: Record<string, ProviderDisplay> = {
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    blurb: "Public videos from tiktok.com and official short links.",
    contentTypes: ["Videos"],
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    blurb: "Public videos from youtube.com and youtu.be links.",
    contentTypes: ["Videos"],
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    blurb: "Public posts where technically feasible.",
    contentTypes: [],
  },
};

export function getDisplayProviders(): ProviderDisplay[] {
  const raw = (process.env.NEXT_PUBLIC_PROVIDERS ?? "tiktok").toLowerCase();
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: ProviderDisplay[] = [];
  for (const id of ids) {
    const known = KNOWN[id];
    if (known) out.push(known);
  }
  return out.length > 0 ? out : [KNOWN.tiktok as ProviderDisplay];
}

export function inputPlaceholder(): string {
  const names = getDisplayProviders().map((p) => p.name);
  if (names.length === 1) return `Paste your ${names[0]} link here…`;
  const last = names.pop() as string;
  return `Paste a ${names.join(", ")} or ${last} link…`;
}
