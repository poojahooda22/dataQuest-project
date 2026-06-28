import { useMemo } from "react";

import { EChart } from "@/components/charts/echart";
import { useChartColors } from "@/lib/echarts-theme";
import { formatCompact, formatValue } from "@/lib/format";
import type { ECOption } from "@/lib/echarts-types";

// Resolve a Tailwind v4 palette CSS var (e.g. --color-emerald-500) to a concrete color for the
// canvas (ECharts can't use `var(...)` directly). Falls back to the palette's hex if unavailable.
function paletteColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

// A revision strip: one bar per period = (value_b − value_a). Green = revised UP, red = revised DOWN,
// mirroring the table's green/red convention.
export function RevisionBars({ points, height = 200 }: { points: { date: string; value: number }[]; height?: number }) {
  const colors = useChartColors();

  const option = useMemo<ECOption>(() => {
    const pos = paletteColor("--color-emerald-500", "#10b981");
    const neg = paletteColor("--color-red-500", "#ef4444");
    return {
      grid: { left: 52, right: 16, top: 16, bottom: 28 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        valueFormatter: (v) => (typeof v === "number" ? formatValue(v) : String(v ?? "")),
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: colors.muted, formatter: (v: number) => formatCompact(v) },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.4 } },
      },
      series: [
        {
          type: "bar",
          data: points.map((p) => ({
            value: [p.date, p.value] as [string, number],
            itemStyle: { color: p.value >= 0 ? pos : neg },
          })),
        },
      ],
    };
  }, [points, colors]);

  return <EChart option={option} height={height} />;
}
