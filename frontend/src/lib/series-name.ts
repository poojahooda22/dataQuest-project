import type { Series } from "@/types/api";

// Human-readable names for the dashboard. The series_id ("USD_CPIAUCSL") and xcat ("CPIAUCSL") are
// codes a reader can't parse — show a plain-English name instead, with the code kept only as a small
// secondary tag. Keyed by xcat; falls back to the (already descriptive) description, then the code.
const NAMES: Record<string, string> = {
  // Inflation
  CPIAUCSL: "US CPI",
  CPILFESL: "Core CPI",
  PCEPI: "PCE prices",
  PCEPILFE: "Core PCE",
  PPIACO: "Producer prices (PPI)",
  // Labor
  UNRATE: "Unemployment rate",
  PAYEMS: "Nonfarm payrolls",
  EMPLOY: "Payrolls (real-time)",
  RUC: "Unemployment (real-time)",
  CIVPART: "Participation rate",
  ICSA: "Initial jobless claims",
  AHETPI: "Avg hourly earnings",
  JTSJOL: "Job openings (JOLTS)",
  // Growth / activity
  GDPC1: "Real GDP",
  ROUTPUT: "Real output (real-time)",
  INDPRO: "Industrial production",
  RSAFS: "Retail sales",
  HOUST: "Housing starts",
  DGORDER: "Durable goods orders",
  // Rates
  DGS10: "10Y Treasury yield",
  DGS2: "2Y Treasury yield",
  DGS3MO: "3M Treasury yield",
  FEDFUNDS: "Fed funds rate",
  T10Y2Y: "10Y–2Y spread",
  // FX
  FXUSD: "EUR / USD",
};

export function seriesName(s: Pick<Series, "xcat" | "description">): string {
  return NAMES[s.xcat] ?? s.description ?? s.xcat;
}