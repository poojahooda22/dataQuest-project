// Number formatting for the dashboard. Tabular figures are applied via Tailwind (`tabular-nums`)
// on the surfaces that need column alignment; these helpers handle value + axis formatting.

export function formatValue(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);
}