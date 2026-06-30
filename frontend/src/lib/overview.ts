import type { QdfRecord, Series } from "@/types/api";

// Per-series at-a-glance stats for the Overview table: latest value + as-of date, and percent change
// over ~1M / ~3M / ~1Y. Computed on real stored points (no fabrication). Period offsets are derived
// from the series frequency so a "1M" change means one month regardless of D/W/M/Q cadence.

export interface OverviewStat {
  series: Series;
  latest: number | null;
  latestDate: string | null;
  chg1m: number | null; // percent
  chg3m: number | null;
  chg1y: number | null;
  spark: number[]; // recent values (chronological) for the row's trend sparkline
}

function offsets(freq: string): { m1: number | null; m3: number | null; y1: number | null } {
  switch (freq) {
    case "D":
      return { m1: 21, m3: 63, y1: 252 }; // trading days
    case "W":
      return { m1: 4, m3: 13, y1: 52 };
    case "M":
      return { m1: 1, m3: 3, y1: 12 };
    case "Q":
      return { m1: null, m3: 1, y1: 4 };
    case "A":
      return { m1: null, m3: null, y1: 1 };
    default:
      return { m1: 1, m3: 3, y1: 12 };
  }
}

function pctChange(values: number[], offset: number | null): number | null {
  if (offset == null) return null;
  const now = values[values.length - 1];
  const past = values[values.length - 1 - offset];
  if (now == null || past == null || past === 0) return null;
  return ((now - past) / past) * 100;
}

export function computeOverview(series: Series[], records: QdfRecord[]): OverviewStat[] {
  const byId = new Map<string, QdfRecord[]>();
  for (const r of records) {
    const arr = byId.get(r.series_id);
    if (arr) arr.push(r);
    else byId.set(r.series_id, [r]);
  }

  return series.map((s) => {
    const recs = (byId.get(s.series_id) ?? [])
      .slice()
      .sort((a, b) => a.observation_date.localeCompare(b.observation_date));
    const values = recs.map((r) => r.value);
    const last = recs[recs.length - 1];
    const off = offsets(s.frequency);
    return {
      series: s,
      latest: last ? last.value : null,
      latestDate: last ? last.observation_date : null,
      chg1m: pctChange(values, off.m1),
      chg3m: pctChange(values, off.m3),
      chg1y: pctChange(values, off.y1),
      spark: values.slice(-120), // bounded recent window for the trend sparkline
    };
  });
}