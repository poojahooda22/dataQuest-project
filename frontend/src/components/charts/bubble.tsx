import { useMemo, type Ref } from "react";

import { EChart, type EChartHandle } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import { align } from "@/lib/align";
import { AlignChip } from "@/components/charts/align-chip";
import { paramValues, type NamedSeries } from "@/lib/echart-util";
import { formatCompact, formatValue } from "@/lib/format";
import type { ECOption } from "@/lib/echarts-types";

// Three variables: x, y, and a third mapped to bubble SIZE. Size encodes by AREA (radius ∝ √value)
// so a 2× value isn't drawn 4× as big — the headline bubble-chart mistake.
export function BubbleChart({
  x,
  y,
  size,
  height = 440,
  ref,
}: {
  x: NamedSeries;
  y: NamedSeries;
  size: NamedSeries;
  height?: number;
  ref?: Ref<EChartHandle>;
}) {
  const colors = useChartColors();
  const aligned = useMemo(
    () => align([x.points, y.points, size.points]),
    [x.points, y.points, size.points],
  );

  const option = useMemo<ECOption>(() => {
    const accent = colors.categorical[0] ?? colors.foreground;
    const data = aligned.rows.flatMap((r) => {
      const a = r.values[0];
      const b = r.values[1];
      const c = r.values[2];
      return a != null && b != null && c != null ? [[a, b, c] as [number, number, number]] : [];
    });
    const maxSize = Math.max(...data.map((d) => Math.abs(d[2])), 1);
    return {
      grid: { left: 68, right: 28, top: 20, bottom: 56 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
      tooltip: {
        trigger: "item",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        formatter: (p) => {
          const v = paramValues(p);
          return `${x.label}: ${formatValue(v[0] ?? NaN)}<br/>${y.label}: ${formatValue(v[1] ?? NaN)}<br/>${size.label}: ${formatValue(v[2] ?? NaN)}`;
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
        {
          type: "scatter",
          data,
          symbolSize: (val) => {
            const arr = val as number[];
            const s = Math.abs(arr?.[2] ?? 0);
            return 6 + Math.sqrt(s / maxSize) * 30;
          },
          itemStyle: { color: accent, opacity: 0.5 },
        },
      ],
    };
  }, [aligned, x.label, y.label, size.label, colors]);

  if (aligned.rows.length === 0) {
    return <PanelEmpty title="No overlap in time" message="These three series don't overlap in the selected window." />;
  }
  return (
    <div className="flex h-full flex-col">
      <EChart option={option} height={height} exportBackground={colors.card} ref={ref} />
      <AlignChip meta={aligned.meta} labels={[x.label, y.label, size.label]} />
    </div>
  );
}