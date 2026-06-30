import type { Point } from "@/lib/transforms";

export type AlignMode = "asof" | "exact";

export interface AlignedRow {
  date: string;
  values: number[];
}

export interface AlignMeta {
  mode: AlignMode;
  /** index of the input series whose dates formed the output grid (as-of); -1 for exact. */
  baseIndex: number;
  /** median spacing (days) of the base grid; null when not applicable (exact / single point). */
  baseGridDays: number | null;
  /** max backward carry (days) a value may be held forward; null when unbounded / exact. */
  toleranceDays: number | null;
  /** rows produced. */
  n: number;
}

export interface AlignResult {
  rows: AlignedRow[];
  meta: AlignMeta;
}

/** Parse an ISO `YYYY-MM-DD` date to a whole-day count (UTC, tz-free) for gap / ordering math. */
function toDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** Median spacing between consecutive observations, in days. `Infinity` for a <2-point series. */
function medianGapDays(pts: Point[]): number {
  if (pts.length < 2) return Infinity;
  const gaps: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) gaps.push(toDays(b.date) - toDays(a.date));
  }
  if (gaps.length === 0) return Infinity;
  gaps.sort((x, y) => x - y);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
}

/** The coarsest series (largest median gap) drives the output grid, so we never up-sample. */
function chooseBase(series: Point[][]): { index: number; gridDays: number } {
  let index = 0;
  let best = -1;
  series.forEach((s, i) => {
    const g = medianGapDays(s);
    const gg = Number.isFinite(g) ? g : Number.MAX_SAFE_INTEGER;
    if (gg > best) {
      best = gg;
      index = i;
    }
  });
  const g = medianGapDays(series[index] ?? []);
  return { index, gridDays: Number.isFinite(g) ? g : 0 };
}

/** A date-ascending copy (merge_asof needs sorted inputs; the read API already returns them sorted). */
function ascending(pts: Point[]): Point[] {
  return [...pts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * As-of / LOCF backward merge: every output date comes from the coarsest (base) series; each OTHER
 * series contributes its last value at or before that date, provided the carry is within `tolerance`
 * days. A row survives only when EVERY series produced a value (all-or-nothing, like a join — but
 * frequency-aware, so monthly-vs-quarterly series relate at the coarser grid instead of collapsing to
 * a handful of exact-date coincidences). The base series contributes its own exact value. This is the
 * `pandas.merge_asof(direction="backward")` semantics, done client-side over the already-fetched,
 * already-transformed point series.
 */
function alignAsOf(series: Point[][], baseIndex: number, toleranceDays: number): AlignedRow[] {
  const sorted = series.map(ascending);
  const base = sorted[baseIndex];
  if (!base) return [];
  const ptr = sorted.map(() => 0); // per-series cursor; advances monotonically with the base date
  const rows: AlignedRow[] = [];
  for (const bp of base) {
    const d = toDays(bp.date);
    const values: number[] = [];
    let ok = true;
    for (let j = 0; j < sorted.length; j++) {
      if (j === baseIndex) {
        values.push(bp.value);
        continue;
      }
      const sj = sorted[j]!;
      let p = ptr[j] ?? 0;
      while (p + 1 < sj.length) {
        const nx = sj[p + 1];
        if (!nx || toDays(nx.date) > d) break;
        p++;
      }
      ptr[j] = p;
      const cand = sj[p];
      if (!cand || toDays(cand.date) > d || d - toDays(cand.date) > toleranceDays) {
        ok = false; // no value at-or-before this date within tolerance → drop the row
        break;
      }
      values.push(cand.value);
    }
    if (ok) rows.push({ date: bp.date, values });
  }
  return rows;
}

/** Exact-date inner join: a date survives only if EVERY series has a value on that exact day. */
function alignExact(series: Point[][]): AlignedRow[] {
  if (series.length === 0) return [];
  const maps = series.map((pts) => new Map(pts.map((p) => [p.date, p.value])));
  const base = series[0] ?? [];
  const rows: AlignedRow[] = [];
  for (const p of base) {
    const values: number[] = [];
    let ok = true;
    for (const m of maps) {
      const v = m.get(p.date);
      if (v == null) {
        ok = false;
        break;
      }
      values.push(v);
    }
    if (ok) rows.push({ date: p.date, values });
  }
  return rows;
}

/**
 * Align N point-series for a relate view (scatter / regression / bubble / cycle). Default `asof`:
 * a frequency-aware as-of/LOCF merge onto the coarsest series' grid, with the carry bounded to ~1.5x
 * that grid's spacing so a value is never held stale across a real gap. `exact` keeps the strict
 * same-day inner join. Returns the rows plus the metadata a UI chip needs to state what it did.
 */
export function align(series: Point[][], mode: AlignMode = "asof"): AlignResult {
  if (series.length === 0) {
    return { rows: [], meta: { mode, baseIndex: -1, baseGridDays: null, toleranceDays: null, n: 0 } };
  }
  if (mode === "exact") {
    const rows = alignExact(series);
    return { rows, meta: { mode, baseIndex: -1, baseGridDays: null, toleranceDays: null, n: rows.length } };
  }
  const { index, gridDays } = chooseBase(series);
  const bounded = gridDays > 0;
  const tolerance = bounded ? Math.round(gridDays * 1.5) : Number.MAX_SAFE_INTEGER;
  const rows = alignAsOf(series, index, tolerance);
  return {
    rows,
    meta: {
      mode,
      baseIndex: index,
      baseGridDays: bounded ? gridDays : null,
      toleranceDays: bounded ? tolerance : null,
      n: rows.length,
    },
  };
}

/** A coarse frequency word for the base grid's median spacing, for the alignment chip. */
export function gridLabel(days: number | null): string {
  if (days == null) return "exact dates";
  if (days <= 2) return "daily";
  if (days <= 10) return "weekly";
  if (days <= 45) return "monthly";
  if (days <= 135) return "quarterly";
  if (days <= 250) return "semiannual";
  return "annual";
}
