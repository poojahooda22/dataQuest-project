import { useMemo } from "react";

import { EChart } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import { correlationMatrix } from "@/lib/correlation";
import { paramValues, type NamedSeries } from "@/lib/echart-util";
import type { ECOption } from "@/lib/echarts-types";

function shorten(label: string): string {
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

// Pairwise correlation of the selected indicators, computed by the caller on % CHANGE (stationary) so it
// is a real co-movement read, not the spurious "everything trends up together" of level correlation.
// Diverging heat: blue = move together (+1), orange = move opposite (−1), faded = no relationship.
export function CorrelationHeatmap({ series, height = 320 }: { series: NamedSeries[]; height?: number }) {
  const colors = useChartColors();
  const { labels, matrix, n } = useMemo(() => correlationMatrix(series), [series]);

  const option = useMemo<ECOption>(() => {
    const data: [number, number, number][] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < labels.length; j++) {
        const v = matrix[i]?.[j];
        if (v != null && Number.isFinite(v)) data.push([j, i, Number(v.toFixed(2))]);
      }
    }
    const ticks = labels.map(shorten);
    return {
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      grid: { left: 124, right: 16, top: 12, bottom: 60 },
      tooltip: {
        position: "top",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        formatter: (p) => {
          const v = paramValues(p); // [x, y, r]
          const x = v[0] ?? 0;
          const y = v[1] ?? 0;
          const r = v[2] ?? NaN;
          return `${labels[y] ?? ""} × ${labels[x] ?? ""}<br/>r = ${Number.isFinite(r) ? r.toFixed(2) : "—"} &nbsp;(n=${n})`;
        },
      },
      xAxis: {
        type: "category",
        data: ticks,
        axisLabel: { color: colors.muted, rotate: 40, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.border } },
        splitArea: { show: true },
      },
      yAxis: {
        type: "category",
        data: ticks,
        axisLabel: { color: colors.muted, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.border } },
        splitArea: { show: true },
      },
      visualMap: {
        min: -1,
        max: 1,
        show: false, // cells stay value-coloured; the gradient legend/scrubber adds nothing here, so it's hidden
        inRange: { color: [colors.up, colors.card, colors.down] }, // −1 orange · 0 faded · +1 blue
      },
      series: [
        {
          type: "heatmap",
          data,
          label: {
            show: true,
            color: colors.foreground,
            fontSize: 10,
            formatter: (p) => {
              const v = paramValues(p);
              const r = v[2];
              return r != null && Number.isFinite(r) ? r.toFixed(2) : "";
            },
          },
          itemStyle: { borderColor: colors.card, borderWidth: 1 },
        },
      ],
    };
  }, [labels, matrix, n, colors]);

  if (series.length < 2) {
    return <PanelEmpty title="Need ≥2 series" message="Pick at least two indicators to correlate." />;
  }
  if (n < 3) {
    return <PanelEmpty title="Not enough overlap" message="These series don't overlap enough to correlate." />;
  }
  return <EChart option={option} height={height} exportBackground={colors.card} />;
}
