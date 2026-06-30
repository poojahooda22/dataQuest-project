import { align } from "@/lib/align";
import type { NamedSeries } from "@/lib/echart-util";

export interface CorrelationResult {
  labels: string[];
  /** matrix[i][j] = Pearson r of series i vs series j over the aligned sample; NaN if undefined. */
  matrix: number[][];
  /** aligned (complete-case) sample size the correlations were computed over. */
  n: number;
}

/** Pearson correlation of two equal-length numeric vectors. NaN for <3 points or a zero-variance side. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  const denom = Math.sqrt(vx * vy);
  return denom === 0 ? NaN : cov / denom;
}

/**
 * Pairwise Pearson correlation across N labelled point-series. The series are as-of aligned (so mixed
 * frequencies still relate) and reduced to the complete-case rows; correlation is then computed
 * column-by-column. Callers should pass STATIONARY inputs (e.g. % change), never raw levels — a
 * correlation of two trending levels is the textbook spurious result.
 */
export function correlationMatrix(series: NamedSeries[]): CorrelationResult {
  const labels = series.map((s) => s.label);
  const k = series.length;
  if (k === 0) return { labels, matrix: [], n: 0 };

  const aligned = align(series.map((s) => s.points));
  const cols: number[][] = Array.from({ length: k }, () => []);
  for (const row of aligned.rows) {
    for (let j = 0; j < k; j++) cols[j]!.push(row.values[j]!);
  }
  const n = aligned.rows.length;

  const matrix: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(NaN));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const r = i === j ? 1 : pearson(cols[i]!, cols[j]!);
      matrix[i]![j] = r;
      matrix[j]![i] = r;
    }
  }
  return { labels, matrix, n };
}
