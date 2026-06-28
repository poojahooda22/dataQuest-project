import type { Point } from "@/lib/transforms";

export interface AlignedRow {
  date: string;
  values: number[];
}

/**
 * Inner-join N point-series on observation_date: a date survives only if EVERY series has a value
 * there. Used to relate two/three series (scatter, bubble, cycle). Exact-date match — series of
 * different frequencies will share few dates (the consumer shows an empty state); an as-of merge
 * across frequencies is a later refinement.
 */
export function alignByDate(series: Point[][]): AlignedRow[] {
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