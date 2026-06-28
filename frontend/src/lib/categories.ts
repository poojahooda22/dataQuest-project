import type { Series } from "@/types/api";

// Group our macro series into themed buckets for the Koyfin-style widget grid. Keyed by `xcat`
// (the indicator code) so it survives across markets (cid). Extend this map as the catalog grows;
// anything unmapped falls into "Other" so a new series is never silently dropped from the grid.

export type Category = "Inflation" | "Labor" | "Growth" | "Rates" | "FX" | "Other";

export const CATEGORIES: Category[] = ["Inflation", "Labor", "Growth", "Rates", "FX"];

const XCAT_CATEGORY: Record<string, Category> = {
  // Inflation
  CPIAUCSL: "Inflation",
  CPILFESL: "Inflation",
  PCEPI: "Inflation",
  PCEPILFE: "Inflation",
  PPIACO: "Inflation",
  // Labor
  UNRATE: "Labor",
  PAYEMS: "Labor",
  EMPLOY: "Labor",
  RUC: "Labor",
  CIVPART: "Labor",
  ICSA: "Labor",
  AHETPI: "Labor",
  JTSJOL: "Labor",
  // Growth / activity
  GDPC1: "Growth",
  ROUTPUT: "Growth",
  INDPRO: "Growth",
  RSAFS: "Growth",
  HOUST: "Growth",
  DGORDER: "Growth",
  // Rates
  DGS10: "Rates",
  DGS2: "Rates",
  DGS3MO: "Rates",
  FEDFUNDS: "Rates",
  T10Y2Y: "Rates",
  // FX
  FXUSD: "FX",
};

export function categoryOf(s: Pick<Series, "xcat">): Category {
  return XCAT_CATEGORY[s.xcat] ?? "Other";
}
