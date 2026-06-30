import { useMemo } from "react";

import { EChart } from "@/components/charts/echart";
import { PanelEmpty } from "@/components/common/panel-state";
import { useChartColors } from "@/lib/echarts-theme";
import { align } from "@/lib/align";
import { AlignChip } from "@/components/charts/align-chip";
import { mean, paramValues, type NamedSeries } from "@/lib/echart-util";
import { formatValue } from "@/lib/format";
import type { ECOption } from "@/lib/echarts-types";

// Business-cycle clock: two state variables on a value×value plane, points connected in TIME order
// so the economy's path traces a loop. Dashed lines at each variable's mean split the quadrants;
// the latest point is marked. Descriptive (where in the cycle), never a directive call.
export function CycleClock({ x, y, height = 440 }: { x: NamedSeries; y: NamedSeries; height?: number }) {
  const colors = useChartColors();
  const aligned = useMemo(() => align([x.points, y.points]), [x.points, y.points]);

  const option = useMemo<ECOption>(() => {
    const accent = colors.categorical[0] ?? colors.foreground;
    const data = aligned.rows.flatMap((r) => {
      const a = r.values[0];
      const b = r.values[1];
      return a != null && b != null ? [[a, b] as [number, number]] : [];
    });
    const meanX = mean(data.map((d) => d[0]));
    const meanY = mean(data.map((d) => d[1]));
    const last = data.length ? data[data.length - 1] : undefined;

    return {
      grid: { left: 64, right: 28, top: 20, bottom: 56 },
      textStyle: { color: colors.foreground, fontFamily: "DM Sans, ui-sans-serif" },
      aria: { enabled: true },
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
        axisLabel: { color: colors.muted },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: y.label,
        nameTextStyle: { color: colors.muted },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.muted },
        splitLine: { show: false },
      },
      toolbox: {
        right: 8,
        top: -2,
        iconStyle: { borderColor: colors.muted },
        feature: {
          saveAsImage: { type: "png", name: "dataquest_cycle", pixelRatio: 2, backgroundColor: colors.card },
        },
      },
      series: [
        {
          type: "line",
          data,
          showSymbol: true,
          symbolSize: 4,
          itemStyle: { color: accent },
          lineStyle: { width: 1, color: accent, opacity: 0.5 },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: colors.border, type: "dashed" },
            data: [{ xAxis: meanX }, { yAxis: meanY }],
          },
          ...(last
            ? {
                markPoint: {
                  symbol: "circle",
                  symbolSize: 12,
                  itemStyle: { color: colors.up },
                  label: { show: false },
                  data: [{ name: "latest", coord: last }],
                },
              }
            : {}),
        },
      ],
    };
  }, [aligned, x.label, y.label, colors]);

  if (aligned.rows.length < 2) {
    return <PanelEmpty title="No overlap in time" message="These series don't overlap in the selected window." />;
  }
  return (
    <div className="flex h-full flex-col">
      <EChart option={option} height={height} />
      <AlignChip meta={aligned.meta} labels={[x.label, y.label]} />
    </div>
  );
}