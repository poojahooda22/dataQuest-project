import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LicenseChip } from "@/components/common/license-chip";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { useCatalog } from "@/hooks/use-catalog";
import { useReliability, type SeriesReliability } from "@/hooks/use-reliability";
import { CATEGORIES, categoryOf, type Category } from "@/lib/categories";
import { seriesName } from "@/lib/series-name";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// Open Data Exploration — DataQuery's 4th feature, the DISCOVERY surface: browse the full catalog with
// the JPMaQS-grammar ticker, theme, frequency, and the two per-series QUALITY verdicts — the
// commercial-display LICENCE (our moat) and the revision RELIABILITY. Search comes from the GLOBAL top-bar
// (no second search box). Both quality columns are sortable + filterable — the differentiators must be
// queryable, not read-only decoration. No data VALUES here — this is the menu, not the meal.

function pill(active: boolean) {
  return cn(
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60",
  );
}

const badge = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

// Market series → "Final" (no revisions); revisable series get the bias verdict from /catalog/reliability,
// with the plain-language readout on hover. Green = no detectable bias; amber = a detectable bias.
function reliabilityBadge(s: Series, rel: SeriesReliability | undefined): { text: string; cls: string; title?: string } {
  const grey = "bg-muted text-muted-foreground";
  if (!s.vintage_capable)
    return { text: "Final", cls: grey, title: "Market observable — no revisions (the first print is final)." };
  if (!rel || rel.status !== "ok")
    return { text: "—", cls: grey, title: "No revisions in the available window." };
  const title = rel.readout ?? undefined;
  if (rel.verdict === "test") {
    return rel.significant
      ? { text: "Biased", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", title }
      : { text: "Reliable", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", title };
  }
  return { text: "Revisable", cls: grey, title };
}

// Rank for sorting the Reliability column, best → worst.
const REL_RANK: Record<string, number> = { RELIABLE: 0, FINAL: 1, REVISABLE: 2, "—": 3, BIASED: 4 };

type SortKey = "name" | "ticker" | "theme" | "market" | "freq" | "reliability" | "licence";

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

export function DataExploration({
  search,
  onOpenInHome,
}: {
  search: string;
  onOpenInHome: (s: Series) => void;
}) {
  const catalog = useCatalog();
  const reliability = useReliability();
  const all = useMemo(() => catalog.data ?? [], [catalog.data]);
  const relMap = useMemo(() => reliability.data?.reliability ?? {}, [reliability.data]);
  const [theme, setTheme] = useState<Category | "all">("all");
  const [commercialOnly, setCommercialOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  function onSort(k: SortKey) {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir("asc");
    }
  }

  function sortValue(s: Series, k: SortKey): string | number {
    switch (k) {
      case "name":
        return seriesName(s);
      case "ticker":
        return s.qdf_ticker ?? s.series_id;
      case "theme":
        return categoryOf(s);
      case "market":
        return s.cid;
      case "freq":
        return s.frequency;
      case "reliability":
        return REL_RANK[reliabilityBadge(s, relMap[s.series_id]).text.toUpperCase()] ?? 9;
      case "licence":
        return s.commercial_ok ? 0 : 1;
    }
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = all
      .filter((s) => theme === "all" || categoryOf(s) === theme)
      .filter((s) => !commercialOnly || s.commercial_ok)
      .filter(
        (s) =>
          !needle ||
          [seriesName(s), s.qdf_ticker ?? s.series_id, s.description].some((t) => t?.toLowerCase().includes(needle)),
      );
    return filtered.sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortValue closes over relMap (in deps)
  }, [all, search, theme, commercialOnly, sort, dir, relMap]);

  const greenCount = useMemo(() => all.filter((s) => s.commercial_ok).length, [all]);

  return (
    <div className="space-y-4 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-lg font-semibold">Open Data Exploration</h1>
        <p className="text-sm text-muted-foreground">
          Browse the full catalog — every series we serve, its JPMaQS-grammar ticker, and its
          commercial-display licence + revision-reliability verdicts. {all.length} indicators ·{" "}
          {greenCount} cleared for commercial display.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/80">Click any series to chart it on the Home dashboard.</p>
      </div>

      {/* controls — theme facets + the commercial-licence filter (search is in the global top bar) */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTheme("all")} className={pill(theme === "all")}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setTheme(c)} className={pill(theme === c)}>
            {c}
          </button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={commercialOnly}
            onChange={(e) => setCommercialOnly(e.target.checked)}
            className="size-3.5 accent-emerald-500"
          />
          Commercial-cleared only
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} shown</span>
      </div>

      {catalog.isError ? (
        <PanelError />
      ) : catalog.isLoading && all.length === 0 ? (
        <PanelLoading label="Loading catalog…" />
      ) : rows.length === 0 ? (
        <PanelEmpty title="No matches" message="No series match the search, theme, or licence filter." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead label="Indicator" col="name" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="QDF ticker" col="ticker" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Theme" col="theme" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Market" col="market" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Freq" col="freq" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Reliability" col="reliability" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Licence" col="licence" sort={sort} dir={dir} onSort={onSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const rb = reliabilityBadge(s, relMap[s.series_id]);
                return (
                  <TableRow
                    key={s.series_id}
                    title={`${s.description} — click to chart on Home`}
                    onClick={() => onOpenInHome(s)}
                    className="cursor-pointer"
                  >
                    <TableCell className="px-3 py-1.5 font-medium text-foreground">{seriesName(s)}</TableCell>
                    <TableCell className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {s.qdf_ticker ?? s.series_id}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">{categoryOf(s)}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">{s.cid}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">{s.frequency}</TableCell>
                    <TableCell className="px-3 py-1.5">
                      <span title={rb.title} className={cn(badge, rb.cls)}>
                        {rb.text}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <LicenseChip ok={s.commercial_ok} attribution={s.attribution} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
