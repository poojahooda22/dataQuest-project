import { useMemo } from "react";

import { EChart } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import type { ConvergencePoint } from "@/lib/revisions";
import type { ECOption } from "@/lib/echarts-types";

// The convergence curve: mean absolute revision (% of the latest estimate) still remaining at each
// release age. Declines toward 0 as the number settles — "which release can I trust for a given
// tolerance?". The data items carry `n` so the tooltip can show how many observations back each point.
export function ConvergenceCurve({ points, height = 280 }: { points: ConvergencePoint[]; height?: number }) {
  const colors = useChartColors();
  const option = useMemo<ECOption>(() => {
    const accent = colors.categorical[0] ?? colors.foreground;
    return {
      grid: { left: 60, right: 20, top: 18, bottom: 44 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        formatter: (p) => {
          const arr = Array.isArray(p) ? p : [p];
          const d = (arr[0] as { data?: { release?: number; value?: number; n?: number } } | undefined)?.data;
          if (!d) return "";
          return `Release ${d.release}<br/>mean abs revision: ${(d.value ?? 0).toFixed(2)}%<br/>n = ${d.n} observations`;
        },
      },
      xAxis: {
        type: "category",
        data: points.map((d) => String(d.release)),
        name: "release  (1 = first print)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: colors.muted },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted },
      },
      yAxis: {
        type: "value",
        name: "% revision vs latest",
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 42,
        nameTextStyle: { color: colors.muted },
        axisLine: { show: false },
        axisLabel: { color: colors.muted, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.3 } },
      },
      series: [
        {
          type: "line",
          data: points.map((d) => ({ value: d.marPct, release: d.release, n: d.n })),
          showSymbol: true,
          symbolSize: 6,
          smooth: false,
          itemStyle: { color: accent },
          lineStyle: { width: 2, color: accent },
          areaStyle: { color: accent, opacity: 0.08 },
        },
      ],
    };
  }, [points, colors]);

  if (points.length === 0) {
    return <PanelEmpty title="Not enough revisions" message="This series has too few revised observations to chart convergence." />;
  }
  return <EChart option={option} height={height} exportBackground={colors.card} />;
}
