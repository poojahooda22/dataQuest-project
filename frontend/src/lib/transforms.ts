import type { Observation } from "@/types/api";

export type TransformId = "level" | "chg" | "pch" | "pc1" | "logdiff" | "index";

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
  { id: "logdiff", label: "Log change", unit: "percent" },
  { id: "index", label: "Index (= 100)", unit: "index" },
];

/**
 * Transforms offered on the RELATE axes (scatter / regression / bubble). No `index` — rescaling both
 * axes to a common base doesn't change a relationship; the honest choices are the level vs a stationary
 * rate (% change / log change), which is what defuses a spurious levels-on-levels correlation.
 */
export const RELATE_TRANSFORMS: TransformId[] = ["level", "pch", "pc1", "logdiff"];

/** Transforms offered on the time-series HERO chart (the over-time view). */
export const SERIES_TRANSFORMS: TransformId[] = ["level", "index", "pch", "pc1", "logdiff"];

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
    let v: number;
    if (id === "chg") {
      v = cur.value - prev.value;
    } else if (id === "logdiff") {
      // Δln × 100 — the stationary "% change" used to relate trending series without spurious drift;
      // defined only for strictly-positive levels (a spread that crosses zero yields no log change).
      v = cur.value > 0 && prev.value > 0 ? (Math.log(cur.value) - Math.log(prev.value)) * 100 : NaN;
    } else {
      // pch / pc1
      v = prev.value !== 0 ? ((cur.value - prev.value) / prev.value) * 100 : NaN;
    }
    if (Number.isFinite(v)) out.push({ date: cur.date, value: v });
  }
  return out;
}

export function transformDef(id: TransformId): TransformDef {
  return TRANSFORMS.find((t) => t.id === id) ?? TRANSFORMS[0]!;
}