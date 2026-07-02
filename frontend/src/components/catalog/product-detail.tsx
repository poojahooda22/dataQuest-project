import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LicenseChip } from "@/components/common/license-chip";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { Sparkline } from "@/components/charts/sparkline";
import { useObservations } from "@/hooks/use-observations";
import { useProduct } from "@/hooks/use-products";
import { seriesName } from "@/lib/series-name";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

type SortKey = "name" | "freq";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function SortHead({
  label,
  col,
  sort,
  dir,
  onSort,
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sort === col;
  return (
    <TableHead className="px-3">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}
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

// The drill-in: one Data Product + its datasets as a searchable, sortable table with a per-row trend
// sparkline, vintage badge, and licence chip (inside a MIXED product the per-row licence carries real
// variance — the roll-up alone would hide the GREEN datasets in a RED product). Clicking a dataset opens
// its DETAIL page; the search box in the top bar filters this table. No data VALUES beyond the trend.
export function ProductDetail({
  productId,
  search = "",
  onBack,
  onOpenDataset,
}: {
  productId: string;
  search?: string;
  onBack: () => void;
  onOpenDataset: (s: Series) => void;
}) {
  const { data, isLoading, isError } = useProduct(productId);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // One bulk call for the whole product's recent values -> per-row sparklines (never N per-row fetches).
  const tickers = useMemo(() => (data?.datasets ?? []).map((s) => s.series_id), [data]);
  const obs = useObservations(tickers, isoDaysAgo(400));
  const sparks = useMemo(() => {
    const by: Record<string, number[]> = {};
    for (const r of obs.data ?? []) (by[r.series_id] ??= []).push(r.value);
    return by;
  }, [obs.data]);

  function onSort(k: SortKey) {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir("asc");
    }
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = (data?.datasets ?? []).filter(
      (s) =>
        !needle ||
        [seriesName(s), s.qdf_ticker ?? s.series_id, s.description].some((t) => t?.toLowerCase().includes(needle)),
    );
    return [...filtered].sort((a, b) => {
      const av = sort === "name" ? seriesName(a) : a.frequency;
      const bv = sort === "name" ? seriesName(b) : b.frequency;
      const cmp = av.localeCompare(bv);
      return dir === "asc" ? cmp : -cmp;
    });
  }, [data, search, sort, dir]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All products
      </button>

      {isError ? (
        <PanelError />
      ) : isLoading && !data ? (
        <PanelLoading label="Loading datasets…" />
      ) : !data ? (
        <PanelEmpty title="No product" message="That product was not found." />
      ) : (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{data.title}</h2>
              <LicenseChip ok={data.commercial_ok} />
            </div>
            {data.description ? <p className="text-sm text-muted-foreground">{data.description}</p> : null}
            <p className="mt-0.5 text-xs text-muted-foreground/80">
              {rows.length} of {data.dataset_count} dataset{data.dataset_count === 1 ? "" : "s"}
              {search.trim() ? " matching the search" : ""} · click any to open it.
            </p>
          </div>

          {rows.length === 0 ? (
            <PanelEmpty title="No matches" message="No datasets match the search." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortHead label="Indicator" col="name" sort={sort} dir={dir} onSort={onSort} />
                    <TableHead className="px-3">QDF ticker</TableHead>
                    <SortHead label="Freq" col="freq" sort={sort} dir={dir} onSort={onSort} />
                    <TableHead className="px-3">Trend</TableHead>
                    <TableHead className="px-3">Vintages</TableHead>
                    <TableHead className="px-3">Licence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow
                      key={s.series_id}
                      title={`${s.description} — click to open the dataset`}
                      onClick={() => onOpenDataset(s)}
                      className="cursor-pointer"
                    >
                      <TableCell className="px-3 py-1.5 font-medium text-foreground">{seriesName(s)}</TableCell>
                      <TableCell className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                        {s.qdf_ticker ?? s.series_id}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Badge variant="badge" color="blue" size="sm">{s.frequency}</Badge>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Sparkline values={(sparks[s.series_id] ?? []).slice(-60)} />
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {s.vintage_capable ? (
                          <Badge variant="badge" color="brand" size="sm">point-in-time</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">final</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <LicenseChip ok={s.commercial_ok} attribution={s.attribution} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
