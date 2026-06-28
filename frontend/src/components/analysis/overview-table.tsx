import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Minus, Plus } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChangeCell } from "@/components/analysis/change-cell";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { formatValue } from "@/lib/format";
import type { OverviewStat } from "@/lib/overview";
import { seriesName } from "@/lib/series-name";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// The dense SGRID screener — every (filtered) series as one row with latest + 1M/3M/1Y change,
// sortable on any column. Click a row to add it to the working set + chart it. Category/frequency
// are filter facets (top bar), NOT row groups — the flat table is the JPMaQS cid×xcat panel
// projected to one market, and the whole point is to sort all indicators against each other.
//
// SCALE NOTE (R-SCALE): Tier-1 — client renders the full filtered ~25-row set with no virtualization.
// Correct at this size. At Tier-2 (1k+ series) this melts → server-side faceted /catalog + row
// virtualization (@tanstack/react-virtual). Not built; flagged, not faked.

type SortKey = "series_id" | "latest" | "chg1m" | "chg3m" | "chg1y";

function valueFor(s: OverviewStat, key: SortKey): number | string | null {
  switch (key) {
    case "series_id":
      return seriesName(s.series);
    case "latest":
      return s.latest;
    case "chg1m":
      return s.chg1m;
    case "chg3m":
      return s.chg3m;
    case "chg1y":
      return s.chg1y;
  }
}

function SortHeader({
  label,
  col,
  sort,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort === col;
  return (
    <TableHead className={cn("px-3", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ChevronsUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function OverviewTable({
  stats,
  scales,
  selectedIds,
  onSelect,
  isLoading,
  isError,
}: {
  stats: OverviewStat[];
  // Per-column tint scale (90th-pct |change|) computed over the FULL set so colour is filter-stable.
  scales: { m1: number; m3: number; y1: number };
  selectedIds: Set<string>;
  onSelect: (s: Series) => void;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("series_id");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const rows = [...stats];
    rows.sort((a, b) => {
      const av = valueFor(a, sort);
      const bv = valueFor(b, sort);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [stats, sort, dir]);

  function onSort(k: SortKey) {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "series_id" ? "asc" : "desc");
    }
  }

  if (isError) return <PanelError />;
  if (isLoading && stats.length === 0) return <PanelLoading label="Loading indicators..." />;
  if (!isLoading && stats.length === 0)
    return <PanelEmpty title="No matches" message="No indicators match the current filters." />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortHeader label="Indicator" col="series_id" sort={sort} dir={dir} onSort={onSort} />
          <SortHeader label="Latest" col="latest" sort={sort} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="1M" col="chg1m" sort={sort} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="3M" col="chg3m" sort={sort} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="1Y" col="chg1y" sort={sort} dir={dir} onSort={onSort} align="right" />
          <TableHead className="w-8 px-2" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const s = row.series;
          const active = selectedIds.has(s.series_id);
          return (
            <TableRow
              key={s.series_id}
              data-state={active ? "selected" : undefined}
              onClick={() => onSelect(s)}
              className="group cursor-pointer"
              title={s.description}
            >
              <TableCell className="px-3 py-1.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{seriesName(s)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.series_id} · {s.source} · {s.frequency}
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right tabular-nums">
                {row.latest != null ? formatValue(row.latest) : "—"}
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right">
                <ChangeCell v={row.chg1m} scale={scales.m1} />
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right">
                <ChangeCell v={row.chg3m} scale={scales.m3} />
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right">
                <ChangeCell v={row.chg1y} scale={scales.y1} />
              </TableCell>
              <TableCell className="w-8 px-2 text-muted-foreground">
                {active ? (
                  <Minus className="size-4 opacity-70" aria-label="Remove from charts" />
                ) : (
                  <Plus className="size-4 opacity-0 transition-opacity group-hover:opacity-70" aria-label="Add to charts" />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}