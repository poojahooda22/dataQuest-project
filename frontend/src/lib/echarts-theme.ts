import { useEffect, useState } from "react";

import { useTheme } from "@/components/theme-provider";

export interface ChartColors {
  foreground: string;
  muted: string;
  border: string;
  card: string;
  categorical: string[];
  up: string;
  down: string;
}

function readVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readChartColors(): ChartColors {
  return {
    foreground: readVar("--foreground") || "#1d1d1f",
    muted: readVar("--muted-foreground") || "#6c6c70",
    border: readVar("--border") || "#dcdce0",
    card: readVar("--card") || "#ffffff",
    categorical: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => readVar(`--chart-cat-${i}`)).filter(Boolean),
    up: readVar("--chart-up") || "#d55e00",
    down: readVar("--chart-down") || "#0072b2",
  };
}

/**
 * Resolve chart colors from the design-system CSS vars, re-reading after the `.dark` class flips.
 * We carry these colors IN the chart option (not via echarts `setTheme`) — that sidesteps the v6
 * `setTheme` data-loss bug (#21200) entirely: a theme flip just recomputes the option, and the
 * chart's `setOption` redraws with the new colors. No `setTheme` call = the bug can't bite.
 */
export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(readChartColors);
  useEffect(() => {
    // Read AFTER the .dark class has been applied to <html> (the provider's effect runs first;
    // rAF defers our read one frame so getComputedStyle sees the new palette).
    const id = requestAnimationFrame(() => setColors(readChartColors()));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  return colors;
}