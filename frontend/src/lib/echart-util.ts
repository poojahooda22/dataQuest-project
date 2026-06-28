import type { Point } from "@/lib/transforms";

/** A labelled point-series destined for a chart axis/line. */
export interface NamedSeries {
  label: string;
  points: Point[];
}

/** Safely read the numeric `value` array off an ECharts tooltip/label callback param (loosely typed by the lib). */
export function paramValues(p: unknown): number[] {
  const v = (p as { value?: unknown }).value;
  return Array.isArray(v) ? (v as number[]) : [];
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}