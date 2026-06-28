import type { Observation } from "@/types/api";

export type TransformId = "level" | "chg" | "pch" | "pc1" | "index";

export interface TransformDef {
  id: TransformId;
  label: string;
  unit: "value" | "percent" | "index";
}

export const TRANSFORMS: TransformDef[] = [
  { id: "level", label: "Level", unit: "value" },
  { id: "chg", label: "Change", unit: "value" },
  { id: "pch", label: "% change", unit: "percent" },
  { id: "pc1", label: "% change, year ago", unit: "percent" },
  { id: "index", label: "Index (= 100)", unit: "index" },
];

export interface Point {
  date: string;
  value: number;
}

function periodsPerYear(frequency: string): number {
  switch (frequency) {
    case "D":
      return 252;
    case "W":
      return 52;
    case "M":
      return 12;
    case "Q":
      return 4;
    case "A":
      return 1;
    default:
      return 12;
  }
}

/**
 * Apply a transform to a point-in-time series. MUST be given the NATIVE-resolution series
 * (never an LTTB-downsampled one): %-change and index need the exact adjacent / year-ago / base
 * observations that downsampling drops — computing them over a reduced series fabricates numbers
 * (the R70 transform-order rule). The display reduction happens AFTER, in the chart (sampling:'lttb').
 */
export function applyTransform(obs: Observation[], id: TransformId, frequency: string): Point[] {
  const pts: Point[] = obs.map((o) => ({ date: o.observation_date, value: o.value }));
  if (id === "level" || pts.length === 0) return pts;

  if (id === "index") {
    const base = pts[0]?.value;
    // Index-to-100 needs a positive base; a zero/near-zero base (e.g. a policy rate at ~0)
    // would explode the series and dominate the axis — leave such a series un-indexed.
    if (!base || base <= 0) return pts;
    return pts.map((p) => ({ date: p.date, value: (p.value / base) * 100 }));
  }

  const lag = id === "pc1" ? periodsPerYear(frequency) : 1;
  const out: Point[] = [];
  for (let i = lag; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[i - lag];
    if (!cur || !prev) continue;
    const v =
      id === "chg"
        ? cur.value - prev.value
        : prev.value !== 0
          ? ((cur.value - prev.value) / prev.value) * 100
          : NaN;
    if (Number.isFinite(v)) out.push({ date: cur.date, value: v });
  }
  return out;
}

export function transformDef(id: TransformId): TransformDef {
  return TRANSFORMS.find((t) => t.id === id) ?? TRANSFORMS[0]!;
}