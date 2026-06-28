import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { EChartsType } from "echarts/core";

import { echarts } from "@/lib/echarts";
import type { ECOption } from "@/lib/echarts-types";

export type EChartHandle = { exportPNG: (name?: string) => void };

/**
 * The ECharts wrapper. Owns the imperative lifecycle: init on mount, a ResizeObserver for
 * container resizes (sidebar/panel changes don't fire a window resize), `setOption` on option
 * change, and `dispose` on unmount (ECharts holds a canvas + global listeners — not disposing
 * leaks them). Theme is carried in the option (see lib/echarts-theme), so no `setTheme` here.
 *
 * Exposes `exportPNG` via ref so a control OUTSIDE the canvas (e.g. a card-header button) can
 * save the chart as an image — the in-canvas toolbox is gone.
 */
export function EChart({
  option,
  height = 380,
  className,
  exportBackground,
  ref,
}: {
  option: ECOption;
  height?: number | string; // number → px; "100%" → fill the parent (parent must have a definite height)
  className?: string;
  exportBackground?: string;
  ref?: Ref<EChartHandle>;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const chart = useRef<EChartsType | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      exportPNG: (name = "dataquest_chart") => {
        const inst = chart.current;
        if (!inst) return;
        const url = inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: exportBackground ?? "#ffffff" });
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.png`;
        a.click();
      },
    }),
    [exportBackground],
  );

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const inst = echarts.init(node, undefined, { renderer: "canvas" });
    chart.current = inst;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(node);
    return () => {
      ro.disconnect();
      inst.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    // replaceMerge the SERIES so a changed series set never leaks across updates via index-merge
    // (e.g. a single-series `areaStyle` sticking on series[0] when the chart later goes multi-series,
    // or ghost lines when the count shrinks). Everything else MERGES, so the user's dataZoom survives.
    chart.current?.setOption(option, { lazyUpdate: true, replaceMerge: ["series"] });
  }, [option]);

  return <div ref={el} style={{ width: "100%", height }} className={className} />;
}
