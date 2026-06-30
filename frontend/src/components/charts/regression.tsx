import { useMemo, type Ref } from "react";

import { EChart, type EChartHandle } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import { align } from "@/lib/align";
import { AlignChip } from "@/components/charts/align-chip";
import { linearRegression } from "@/lib/stats";
import { paramValues, type NamedSeries } from "@/lib/echart-util";
import { formatCompact, formatValue } from "@/lib/format";
import type { ECOption } from "@/lib/echarts-types";

// Scatter + an OLS fit line, clipped to the observed x-range (never extrapolated). The raw points
// are always shown (Anscombe's quartet — never the fit alone). Linear only; LOESS/bands deferred.
export function RegressionChart({
  x,
  y,
  height = 420,
  ref,
}: {
  x: NamedSeries;
  y: NamedSeries;
  height?: number;
  ref?: Ref<EChartHandle>;
}) {
  const colors = useChartColors();
  const aligned = useMemo(() => align([x.points, y.points]), [x.points, y.points]);

  const option = useMemo<ECOption>(() => {
    const accent = colors.categorical[0] ?? colors.foreground;
    const data = aligned.rows.flatMap((r) => {
      const a = r.values[0];
      const b = r.values[1];
      return a != null && b != null ? [[a, b] as [number, number]] : [];
    });
    const fit = linearRegression(data);
    const xs = data.map((d) => d[0]);
    const xMin = xs.length ? Math.min(...xs) : 0;
    const xMax = xs.length ? Math.max(...xs) : 0;
    const fitLine: Array<[number, number]> = fit
      ? [
          [xMin, fit.intercept + fit.slope * xMin],
          [xMax, fit.intercept + fit.slope * xMax],
        ]
      : [];

    return {
      grid: { left: 68, right: 28, top: 34, bottom: 56 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
      title: fit
        ? {
            left: "center",
            top: 4,
            text: `y = ${fit.intercept.toFixed(2)} + ${fit.slope.toFixed(3)}·x    R² = ${fit.r2.toFixed(3)}`,
            textStyle: { fontSize: 11, fontWeight: "normal", color: colors.muted },
          }
        : undefined,
      tooltip: {
        trigger: "item",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        formatter: (p) => {
          const v = paramValues(p);
          return `${x.label}: ${formatValue(v[0] ?? NaN)}<br/>${y.label}: ${formatValue(v[1] ?? NaN)}`;
        },
      },
      xAxis: {
        type: "value",
        scale: true,
        name: x.label,
        nameLocation: "middle",
        nameGap: 32,
        nameTextStyle: { color: colors.muted },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted, formatter: (v: number) => formatCompact(v) },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.3 } },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: y.label,
        nameLocation: "middle", // vertical axis title, centered, to the LEFT of the tick numbers
        nameRotate: 90,
        nameGap: 46,
        nameTextStyle: { color: colors.muted },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted, formatter: (v: number) => formatCompact(v) },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.3 } },
      },
      series: [
        { type: "scatter", name: "observations", data, symbolSize: 7, itemStyle: { color: accent, opacity: 0.55 } },
        ...(fit
          ? [
              {
                type: "line" as const,
                name: "fit",
                data: fitLine,
                showSymbol: false,
                lineStyle: { color: colors.up, width: 2 },
                tooltip: { show: false },
              },
            ]
          : []),
      ],
    };
  }, [aligned, x.label, y.label, colors]);

  if (aligned.rows.length < 2) {
    return (
      <PanelEmpty
        title="Not enough overlapping points"
        message="A fit needs at least two aligned points between the series."
      />
    );
  }
  return (
    <div className="flex h-full flex-col">
      <EChart option={option} height={height} exportBackground={colors.card} ref={ref} />
      <AlignChip meta={aligned.meta} labels={[x.label, y.label]} />
    </div>
  );
}