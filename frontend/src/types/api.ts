// Wire types — mirror the SHIPPED FastAPI read API (backend/app/api/routes/*.py + models.py),
// verified against the route + model code this session. Do NOT extend beyond what the API returns;
// to-build endpoints (e.g. /panel) get their types when they ship.

/** Liveness — GET /health. */
export interface Health {
  status: string;
}

/** One catalog row — GET /catalog (list) and GET /catalog/{ticker} (single). Mirrors models.Series. */
export interface Series {
  series_id: string;
  cid: string;
  xcat: string;
  source: string;
  source_series_id: string;
  regime: string; // "A" revisable | "B" market
  vintage_capable: boolean;
  commercial_ok: boolean;
  attribution: string;
  frequency: string;
  description: string;
}

/** One observation inside a point-in-time series response. */
export interface Observation {
  observation_date: string; // ISO YYYY-MM-DD
  value: number;
  vintage_date: string;
}

/** GET /series/{ticker} — the series as known on `as_of`. Carries the licence gate. */
export interface SeriesResponse {
  ticker: string;
  as_of: string;
  commercial_ok: boolean;
  attribution: string;
  downsampled: boolean;
  observations: Observation[];
}

/** GET /observations — flat bulk rows. NOTE: no licence-gate fields; not used for a displayed compare. */
export interface QdfRecord {
  series_id: string;
  observation_date: string;
  vintage_date: string;
  value: number;
}

/** One aligned row of a vintage comparison — part of PanelResponse. */
export interface PanelPoint {
  observation_date: string;
  value_a: number | null; // as known on vintage_a (null = period not yet known then)
  value_b: number | null; // as known on vintage_b
  revision: number | null; // value_b - value_a
  revision_pct: number | null;
}

/** Revision summary over the full compared set. */
export interface PanelSummary {
  n_compared: number;
  n_revised: number;
  mean_revision: number | null;
  mean_abs_revision: number | null;
  max_abs_revision: number | null;
}

/** GET /series/{ticker}/panel — diff-two-vintages (vintage_a vs vintage_b). Carries the licence gate. */
export interface PanelResponse {
  ticker: string;
  vintage_a: string;
  vintage_b: string;
  commercial_ok: boolean;
  attribution: string;
  downsampled: boolean;
  summary: PanelSummary;
  points: PanelPoint[];
}