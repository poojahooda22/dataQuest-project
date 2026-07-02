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
  commercial_ok: boolean; // cleared for commercial DISPLAY
  downloadable: boolean; // cleared to redistribute as a FILE
  attribution: string;
  frequency: string;
  description: string;
  unit?: string | null; // the value's unit ("%", "index", ...); null = unstated
  qdf_ticker?: string | null; // JPMaQS-grammar ticker, e.g. "USD_CPI_SA" (null = not mapped)
  product_id?: string | null; // the Data Product this series belongs to (null = ungrouped)
}

/** A Data Product summary — GET /products. The catalog grouping level (Catalog -> Data Product -> Dataset). */
export interface DataProductSummary {
  product_id: string;
  title: string;
  description: string;
  theme: string;
  sort_order: number;
  dataset_count: number;
  commercial_ok: boolean; // roll-up: true only if EVERY dataset is commercial_ok (contamination AND)
}

/** GET /products/{id} — one Data Product + its datasets. */
export interface ProductDetail extends DataProductSummary {
  datasets: Series[];
}

/** One recently-updated series — GET /catalog/changes. vintage_date IS the publication event. */
export interface CatalogChange {
  series: Series;
  latest_vintage: string; // the newest publication (vintage) date in the store
  new_observations: number; // information-states published after `since`
}

/** GET /catalog/changes — what the sources published recently. */
export interface CatalogChangesResponse {
  since: string;
  changes: CatalogChange[];
}

/** One field of a dataset's data dictionary — GET /datasets/{ticker}/attributes. */
export interface DatasetAttribute {
  identifier: string;
  title: string;
  dataType: string;
  isDatasetKey: boolean;
  description: string;
  source: string;
}

/** GET /datasets/{ticker}/attributes — the data dictionary. Carries the licence gate. */
export interface DatasetAttributesResponse {
  ticker: string;
  commercial_ok: boolean;
  attribution: string;
  attributes: DatasetAttribute[];
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

/** One information-state of an observation: the value as it was known on `vintage_date`. */
export interface RevisionVintage {
  vintage_date: string;
  value: number;
}

/** One observation's full revision history — successive vintages, ordered first-print → latest. */
export interface RevisionObservation {
  observation_date: string;
  vintages: RevisionVintage[];
}

/** GET /series/{ticker}/revisions — every vintage of every observation. Carries the licence gate. */
export interface RevisionsResponse {
  ticker: string;
  commercial_ok: boolean;
  attribution: string;
  observations: RevisionObservation[];
}

/** The gated bias significance test inside the revision-stats payload. */
export interface RevisionBiasTest {
  verdict: "test" | "estimate_only" | "insufficient" | "no_variation";
  gate_reason: "low_n" | "high_persistence" | null;
  n: number;
  df_b?: number;
  rho_hat_1?: number | null;
  mr?: number;
  bias_se?: number;
  p_value: number | null;
  ci_low?: number;
  ci_high?: number;
  ci_level?: number;
  mde?: number;
  significant: boolean | null;
  size_note?: string | null;
  se_method?: string;
}

/** GET /series/{ticker}/revision-stats — the reliability readout + gated bias test (computed values). */
export interface RevisionStats {
  ticker: string;
  N: number;
  mode: string;
  horizon_days: number;
  benchmark_excluded: number;
  n_revision_events: number;
  all_zero_revisions: boolean;
  rho_hat_1: number | null;
  mr: number;
  mar: number;
  rmsr: number;
  sd_r: number | null;
  noise_to_signal: number | null;
  frac_correct_sign: number | null;
  bias_test: RevisionBiasTest;
  commercial_ok: boolean;
  attribution: string;
  readout: string;
}

/** The `N == 0` variant — no revisable observations; a typed unavailable, never fabricated stats. */
export interface RevisionStatsUnavailable {
  ticker: string;
  status: "unavailable";
  reason: string;
  N: number;
  commercial_ok: boolean;
}

export type RevisionStatsResponse = RevisionStats | RevisionStatsUnavailable;