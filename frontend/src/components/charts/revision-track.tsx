import { useMemo } from "react";

import { EChart } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import { formatValue } from "@/lib/format";
import type { TrackPoint } from "@/lib/revisions";
import type { ECOption } from "@/lib/echarts-types";

// The fixed-event revision track: ONE observation's value as it was published on each successive vintage
// date — a step line (the number HELD that value until the next revision). The most intuitive revision
// picture: you watch a single period's estimate march from its first print to today's number.
export function RevisionTrack({ points, height = 280 }: { points: TrackPoint[]; height?: number }) {
  const colors = useChartColors();
  const option = useMemo<ECOption>(() => {
    const accent = colors.categorical[0] ?? colors.foreground;
    const data = points.map((p) => [p.vintage_date, p.value] as [string, number]);
    return {
      grid: { left: 70, right: 22, top: 18, bottom: 40 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.card,
        borderColor: colors.border,
        textStyle: { color: colors.foreground },
        formatter: (p) => {
          const arr = Array.isArray(p) ? p : [p];
          const v = (arr[0] as { value?: [string, number] } | undefined)?.value;
          if (!v) return "";
          return `As known on ${v[0]}<br/>value: ${formatValue(v[1])}`;
        },
      },
      xAxis: {
        type: "time",
        name: "as known on (vintage date)",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: colors.muted },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: "published value",
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 52,
        nameTextStyle: { color: colors.muted },
        axisLine: { show: false },
        axisLabel: { color: colors.muted },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.3 } },
      },
      series: [
        {
          type: "line",
          data,
          step: "end", // the value held until the next vintage revised it — a staircase, not a slope
          showSymbol: true,
          symbolSize: 6,
          itemStyle: { color: accent },
          lineStyle: { width: 1.75, color: accent },
        },
      ],
    };
  }, [points, colors]);

  if (points.length < 2) {
    return <PanelEmpty title="Pick a period" message="Choose an observation period with at least two vintages to see its revisions." />;
  }
  return <EChart option={option} height={height} exportBackground={colors.card} />;
}
