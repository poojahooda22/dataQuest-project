import { useMemo, type Ref } from "react";

import { EChart, type EChartHandle } from "@/components/charts/echart";
import { useChartColors } from "@/lib/echarts-theme";
import { formatCompact, formatValue } from "@/lib/format";
import type { NamedSeries } from "@/lib/echart-util";
import type { ECOption } from "@/lib/echarts-types";

// Multi-series line/area. One line per series; for a single series it fills as an area. Use
// index-to-100 (the transform) when comparing different units — the recommended cross-series mode.
export function TimeSeriesChart({
  lines,
  unit = "value",
  height = 380,
  ref,
}: {
  lines: NamedSeries[];
  unit?: "value" | "percent" | "index";
  height?: number | string;
  ref?: Ref<EChartHandle>;
}) {
  const colors = useChartColors();

  const option = useMemo<ECOption>(() => {
    const isPercent = unit === "percent";
    const palette = colors.categorical.length ? colors.categorical : [colors.foreground];
    const multi = lines.length > 1;
    return {
      grid: { left: 38, right: 16, top: 16, bottom: multi ? 52 : 32 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
      // Legend at the BOTTOM (scrollable) so it never overlaps the plot in a narrow grid cell.
      legend: multi ? { bottom: 0, type: "scroll", textStyle: { color: colors.muted } } : undefined,
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        // Show EVERY series at the hovered date. A series with no point on that exact date (e.g. a
        // QUARTERLY series under a MONTHLY cursor) falls back to its last value AT OR BEFORE the
        // cursor, so all lines always appear (mixed-frequency-safe, point-in-time read).
        formatter: (params) => {
          // ECharts types the axis-trigger formatter param loosely (no `axisValue` on the union); narrow it.
          const arr = (Array.isArray(params) ? params : [params]) as Array<{ axisValue?: number | string }>;
          if (arr.length === 0) return "";
          const raw = arr[0]?.axisValue;
          const ts = typeof raw === "number" ? raw : new Date(raw ?? 0).getTime();
          const header = new Date(ts).toISOString().slice(0, 10);
          const rows = lines
            .map((l, i) => {
              let val: number | undefined;
              for (const p of l.points) {
                if (new Date(p.date).getTime() <= ts) val = p.value;
                else break;
              }
              if (val === undefined) return "";
              const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${palette[i % palette.length]}"></span>`;
              return `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;line-height:1.8"><span style="display:inline-flex;align-items:center;gap:6px">${dot}${l.label}</span><b>${formatValue(val)}${isPercent ? "%" : ""}</b></div>`;
            })
            .join("");
          return `<div style="font-size:12px"><div style="margin-bottom:2px;color:${colors.muted}">${header}</div>${rows}</div>`;
        },
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
        name: isPercent ? "%" : "",
        nameTextStyle: { color: colors.muted },
        axisLabel: { color: colors.muted, formatter: (v: number) => formatCompact(v) },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.4 } },
      },
      // Scroll/pinch zoom only — no slider bar below the chart (Koyfin-clean; range is the pills).
      dataZoom: [{ type: "inside" }],
      color: palette,
      series: lines.map((l) => ({
        type: "line" as const,
        name: l.label,
        data: l.points.map((p) => [p.date, p.value] as [string, number]),
        showSymbol: false,
        sampling: "lttb" as const,
        lineStyle: { width: 2 },
        // Always set areaStyle explicitly. Series now MERGE by id across updates (see echart.tsx), so an
        // OMITTED areaStyle would let a single-series fill stick on series[0] when the chart goes
        // multi-series — set opacity 0 in the multi case rather than dropping the key.
        areaStyle: { opacity: multi ? 0 : 0.08 },
      })),
    };
  }, [lines, unit, colors]);

  return <EChart option={option} height={height} exportBackground={colors.card} ref={ref} />;
}
