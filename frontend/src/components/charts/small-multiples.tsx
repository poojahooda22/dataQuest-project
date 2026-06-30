import { useMemo } from "react";

import { EChart } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import type { NamedSeries } from "@/lib/echart-util";
import type { ECOption } from "@/lib/echarts-types";

// One series in its own mini panel. Kept tiny + axis-light so a wall of them reads as shape-at-a-glance.
function MiniLine({ s, color }: { s: NamedSeries; color: string }) {
  const colors = useChartColors();
  // The series name rides up the y-axis (vertical), truncated to fit the short panel height.
  const name = s.label.length > 16 ? `${s.label.slice(0, 15)}…` : s.label;
  const option = useMemo<ECOption>(
    () => ({
      grid: { left: 54, right: 12, top: 10, bottom: 18 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      tooltip: { trigger: "axis", backgroundColor: colors.card, borderColor: colors.border, textStyle: { color: colors.foreground } },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted, fontSize: 9, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        name,
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 36,
        nameTextStyle: { color: colors.muted, fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: colors.muted, fontSize: 9 },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.25 } },
      },
      series: [
        {
          type: "line",
          data: s.points.map((p) => [p.date, p.value] as [string, number]),
          showSymbol: false,
          lineStyle: { width: 1.25, color },
          sampling: "lttb",
        },
      ],
    }),
    [name, color, colors, s.points],
  );
  return <EChart option={option} height={132} exportBackground={colors.card} />;
}

// Faceted small multiples: every selected indicator in its own mini panel rather than one crowded
// overlay (small multiples beat a >4-line overlay for legibility — the macrosynergy view_timelines
// pattern). Shows the SAME transform the hero overlay uses, just un-overlaid.
export function SmallMultiples({ series }: { series: NamedSeries[] }) {
  const colors = useChartColors();
  if (series.length === 0) {
    return <PanelEmpty title="No data" message="Pick indicators from the table to facet them." />;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {series.map((s, i) => (
        <MiniLine key={s.label} s={s} color={colors.categorical[i % colors.categorical.length] ?? colors.foreground} />
      ))}
    </div>
  );
}
