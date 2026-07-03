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

// ── Index Lab — GET /api/v1/indices/* (mirrors backend/app/api/routes/indices.py) ──

/** One index in the list — GET /indices. Carries the per-index commercial-display verdict. */
export interface IndexSummary {
  index_id: string;
  title: string;
  description: string;
  family: string; // "Treasury" | "EMBI-class"
  universe: string; // "US Treasuries" | "EM Sovereigns"
  currency: string;
  cap_scheme: string; // "none" | "pct" | "ica"
  commercial_ok: boolean;
  attribution: string;
  latest_rebalance: string | null; // ISO date of the newest stored rebalance
  n_eligible: number;
  n_excluded: number;
}

/** The construction rules, as data — shown in the "how it's built" panel. */
export interface IndexRules {
  income_ceiling_usd: number | null; // GNI/capita eligibility ceiling; null = no income screen
  min_face_usd_mn: number;
  min_maturity_years: number;
  exit_maturity_months: number;
  cap_scheme: string;
  cap_pct: number | null;
  rebalance_rule: string;
}

/** GET /indices/{id} — one index: rules-as-data + latest-composition summary. */
export interface IndexDetail extends IndexSummary {
  rules: IndexRules;
  methodology_note: string;
  doc_version: string;
  latest_vintage: string | null;
}

/** One constituent of a composition (a bond or a country). */
export interface Constituent {
  constituent_id: string;
  constituent_name: string;
  cid: string;
  face_amount: number; // USD millions
  raw_weight: number; // 0..1, before the cap
  capped_weight: number; // 0..1, after the cap
  eligible: boolean;
  eligibility_reason: string;
}

/** GET /indices/{id}/composition — the point-in-time composition. Carries the licence gate. */
export interface CompositionResponse {
  index_id: string;
  as_of: string;
  rebalance_date: string;
  vintage_date: string;
  commercial_ok: boolean;
  attribution: string;
  n_eligible: number;
  n_excluded: number;
  constituents: Constituent[];
}

/** One rebalance change — part of ChangesResponse. */
export interface IndexChange {
  constituent_id: string;
  constituent_name: string;
  kind: "added" | "dropped" | "reweighted";
  old_weight: number | null;
  new_weight: number | null;
}

/** GET /indices/{id}/changes — what changed between the two most recent rebalances. */
export interface ChangesResponse {
  index_id: string;
  from_rebalance: string | null;
  to_rebalance: string | null;
  changes: IndexChange[];
}