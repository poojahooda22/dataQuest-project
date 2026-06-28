import { cn } from "@/lib/utils";

export type ChartType = "line" | "scatter" | "regression" | "cycle" | "bubble";

export const CHART_TYPES: { id: ChartType; label: string; need: number }[] = [
  { id: "line", label: "Line", need: 1 },
  { id: "scatter", label: "Scatter", need: 2 },
  { id: "regression", label: "Regression", need: 2 },
  { id: "cycle", label: "Cycle", need: 2 },
  { id: "bubble", label: "Bubble", need: 3 },
];

export function chartNeed(type: ChartType): number {
  return CHART_TYPES.find((t) => t.id === type)?.need ?? 1;
}

export function ChartSwitcher({
  value,
  onChange,
  count,
}: {
  value: ChartType;
  onChange: (t: ChartType) => void;
  count: number;
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-border p-0.5">
      {CHART_TYPES.map((t) => {
        const disabled = count < t.need;
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            title={disabled ? `Needs ${t.need} series` : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              value === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}