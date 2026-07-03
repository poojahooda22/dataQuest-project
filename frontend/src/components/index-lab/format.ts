// Shared number formatting for the Index Lab surfaces (weights + face amounts).

/** A weight in [0,1] as a percent, e.g. 0.0305 -> "3.05%". */
export function pct(weight: number): string {
  return `${(weight * 100).toFixed(2)}%`;
}

/** A face amount in USD MILLIONS -> a readable $ string, e.g. 194369 -> "$194.4bn". */
export function fmtFace(millions: number): string {
  if (millions >= 1_000_000) return `$${(millions / 1_000_000).toFixed(1)}tn`;
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(1)}bn`;
  return `$${millions.toFixed(0)}mn`;
}
