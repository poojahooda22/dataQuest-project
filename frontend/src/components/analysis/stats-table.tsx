import { formatValue } from "@/lib/format";
import type { Observation } from "@/types/api";

export interface SeriesStat {
  label: string;
  obs: Observation[];
  frequency: string;
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

function compute(obs: Observation[], frequency: string) {
  if (obs.length === 0) return null;
  const vals = obs.map((o) => o.value);
  const last = obs[obs.length - 1]!;
  const prev = obs[obs.length - 2];
  const yearAgo = obs[obs.length - 1 - periodsPerYear(frequency)];
  const chg = prev ? last.value - prev.value : null;
  const yoy = yearAgo && yearAgo.value !== 0 ? ((last.value - yearAgo.value) / yearAgo.value) * 100 : null;
  return {
    latest: last.value,
    latestDate: last.observation_date,
    chg,
    yoy,
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
}

// A signed change with a colour + arrow (blue↔orange, CVD-safe — not red/green) and a sign, so the
// direction survives colour-blindness and locale colour conventions.
function Change({ v, pct }: { v: number | null; pct?: boolean }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>;
  const cls = v > 0 ? "text-[var(--chart-up)]" : v < 0 ? "text-[var(--chart-down)]" : "text-muted-foreground";
  return (
    <span className={cls}>
      {v > 0 ? "+" : ""}
      {formatValue(v)}
      {pct ? "%" : ""} {v > 0 ? "▲" : v < 0 ? "▼" : ""}
    </span>
  );
}

// Per-series summary: latest, period change, year-over-year, and the range min/max — the dense,
// scannable "data in a table" surface that pairs with the chart.
export function StatsTable({ series }: { series: SeriesStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Series</th>
            <th className="pb-2 text-right font-medium">Latest</th>
            <th className="pb-2 text-right font-medium">Change</th>
            <th className="pb-2 text-right font-medium">Year ago</th>
            <th className="pb-2 text-right font-medium">Min</th>
            <th className="pb-2 text-right font-medium">Max</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => {
            const st = compute(s.obs, s.frequency);
            return (
              <tr key={s.label} className="border-t border-border">
                <td className="py-1.5 pr-2 font-medium">{s.label}</td>
                <td className="py-1.5 text-right">{st ? formatValue(st.latest) : "—"}</td>
                <td className="py-1.5 text-right">
                  <Change v={st?.chg ?? null} />
                </td>
                <td className="py-1.5 text-right">
                  <Change v={st?.yoy ?? null} pct />
                </td>
                <td className="py-1.5 text-right text-muted-foreground">{st ? formatValue(st.min) : "—"}</td>
                <td className="py-1.5 text-right text-muted-foreground">{st ? formatValue(st.max) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}