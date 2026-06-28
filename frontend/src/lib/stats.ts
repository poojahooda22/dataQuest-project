export interface LinearFit {
  slope: number;
  intercept: number;
  r2: number;
}

/**
 * Ordinary least-squares linear fit over [x, y] pairs. Returns null for < 2 points or a
 * degenerate (vertical) x. Linear only — polynomial/LOESS + confidence bands are deferred
 * (the chosen library, echarts-stat, ships neither; see the dashboard research doc §4).
 */
export function linearRegression(xy: Array<[number, number]>): LinearFit | null {
  const n = xy.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of xy) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const rDen = Math.sqrt(denom * (n * syy - sy * sy));
  const r = rDen === 0 ? 0 : (n * sxy - sx * sy) / rDen;
  return { slope, intercept, r2: r * r };
}