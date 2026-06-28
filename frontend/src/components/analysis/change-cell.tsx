import { cn } from "@/lib/utils";

// 90th-percentile of |value| across a column — the tint scale. Computed over the FULL series set
// (not the filtered view) so a cell's colour intensity stays stable as the user filters.
export function pct90(values: (number | null)[]): number {
  const xs = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .map(Math.abs)
    .sort((a, b) => a - b);
  if (xs.length === 0) return 1;
  return xs[Math.floor(0.9 * (xs.length - 1))] || 1;
}

// One signed-percent change cell — the Lumina house style: GREEN text for a rise, RED for a fall,
// with a redundant +/− sign and ▲/▼ arrow, and NO filled chip. A horizon the series frequency can't
// support arrives as null → "—" (never a fabricated number). `scale` is accepted for call-site
// compatibility but no longer tints.
export function ChangeCell({ v }: { v: number | null; scale?: number }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>;
  const cls =
    v > 0
      ? "text-emerald-600 dark:text-emerald-500"
      : v < 0
        ? "text-red-600 dark:text-red-500"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center justify-end gap-0.5 tabular-nums", cls)}>
      {v > 0 ? "+" : ""}
      {v.toFixed(2)}% {v > 0 ? "▲" : v < 0 ? "▼" : ""}
    </span>
  );
}
