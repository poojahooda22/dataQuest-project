import { gridLabel, type AlignMeta } from "@/lib/align";

/**
 * A one-line readout of how a relate view aligned its series, so an as-of/LOCF merge is never silent:
 * which series set the grid, that grid's frequency, and the max carry-forward. Falls back to the
 * exact-join wording when the strict mode is used. Renders nothing for an empty result (the panel
 * shows its own empty state).
 */
export function AlignChip({ meta, labels }: { meta: AlignMeta; labels: string[] }) {
  if (meta.n === 0) return null;
  if (meta.mode === "exact") {
    return (
      <p className="px-1 pt-1.5 text-[11px] leading-tight text-muted-foreground">Exact-date join · N={meta.n}</p>
    );
  }
  const base = (meta.baseIndex >= 0 ? labels[meta.baseIndex] : undefined) ?? "base series";
  const carry = meta.toleranceDays != null ? ` · max carry ${meta.toleranceDays}d` : "";
  return (
    <p className="px-1 pt-1.5 text-[11px] leading-tight text-muted-foreground">
      As-of aligned (LOCF) · {gridLabel(meta.baseGridDays)} grid from {base}
      {carry} · N={meta.n}
    </p>
  );
}
