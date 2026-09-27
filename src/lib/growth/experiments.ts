import { createHash } from "node:crypto";

/**
 * Deterministic experiment assignment: hash(userId + experimentId) decides
 * the variant, so a user never flips between requests. Control/variant only —
 * never applied to billing, security, permissions, or privacy controls.
 */
export interface ExperimentDef {
  id: string;
  variants: readonly ["control", "variant"];
  rolloutPercent: number; // 0-100 of users included (rest get control)
}

export const EXPERIMENTS: Record<string, ExperimentDef> = {
  hero_cta: {
    id: "hero_cta",
    variants: ["control", "variant"],
    rolloutPercent: 50,
  },
};

export function assignExperiment(experimentId: string, subjectId: string): "control" | "variant" {
  const def = EXPERIMENTS[experimentId];
  if (!def) return "control";
  const h = createHash("sha256").update(`${experimentId}:${subjectId}`).digest();
  const bucket = h.readUInt16BE(0) % 100;
  if (bucket >= def.rolloutPercent) return "control";
  return h[2]! % 2 === 0 ? "control" : "variant";
}
