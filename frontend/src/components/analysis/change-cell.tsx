import type { CSSProperties } from "react";

// 90th-percentile of |value| across a column — the heat scale. Computed over the FULL series set
// (not the filtered view) so a cell's colour intensity stays stable as the user filters.
export function pct90(values: (number | null)[]): number {
  const xs = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .map(Math.abs)
    .sort((a, b) => a - b);
  if (xs.length === 0) return 1;
  return xs[Math.floor(0.9 * (xs.length - 1))] || 1;
}

// SGRID conditional-format heat: a diverging GREEN(rise)→RED(fall) cell background whose opacity scales
// with |v| relative to the column's 90th-percentile — so sign AND magnitude read at a glance across the
// screener, and a few outliers don't wash everything out. Returns undefined for null/zero (no fill).
export function heatStyle(v: number | null, scale: number): CSSProperties | undefined {
  if (v == null || !Number.isFinite(v) || v === 0) return undefined;
  const intensity = Math.min(Math.abs(v) / (scale || 1), 1);
  const alpha = 0.07 + intensity * 0.31; // faint floor so small moves still tint; cap ~0.38
  const rgb = v > 0 ? "16, 185, 129" : "239, 68, 68"; // emerald-500 / red-500
  return { backgroundColor: `rgba(${rgb}, ${alpha.toFixed(3)})` };
}

// One signed-percent change cell. The +/− sign and ▲/▼ arrow carry direction (CVD-safe, redundant with
// the heat fill behind the cell); the text stays neutral so it reads on the coloured background. A
// horizon the series frequency can't support arrives as null → "—" (never a fabricated number).
export function ChangeCell({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-0.5 tabular-nums text-foreground">
      {v > 0 ? "+" : ""}
      {v.toFixed(2)}% {v > 0 ? "▲" : v < 0 ? "▼" : ""}
    </span>
  );
}
