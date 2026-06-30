import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LicenseChip } from "@/components/common/license-chip";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { useCatalog } from "@/hooks/use-catalog";
import { useReliability, type SeriesReliability } from "@/hooks/use-reliability";
import { CATEGORIES, categoryOf, type Category } from "@/lib/categories";
import { seriesName } from "@/lib/series-name";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// Open Data Exploration — DataQuery's 4th feature, the DISCOVERY surface: browse the full catalog of
// everything we serve, ungated, with the JPMaQS-grammar ticker, theme, frequency, and the two per-series
// QUALITY verdicts — the commercial-display LICENCE (our moat) and the revision RELIABILITY (the same
// signal the Data Insights card computes). This is where those verdicts belong (a data-catalog browser),
// not on the analysis SGRID. No data VALUES here — this is the menu, not the meal.

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

export function DataExploration() {
  const catalog = useCatalog();
  const reliability = useReliability();
  const all = useMemo(() => catalog.data ?? [], [catalog.data]);
  const relMap = useMemo(() => reliability.data?.reliability ?? {}, [reliability.data]);
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<Category | "all">("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((s) => theme === "all" || categoryOf(s) === theme)
      .filter(
        (s) =>
          !needle ||
          [seriesName(s), s.qdf_ticker ?? s.series_id, s.description].some((t) => t?.toLowerCase().includes(needle)),
      )
      .sort((a, b) => seriesName(a).localeCompare(seriesName(b)));
  }, [all, q, theme]);

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
      </div>

      {/* controls — search + theme facets */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the catalog…"
          className="h-9 w-[260px]"
        />
        <button type="button" onClick={() => setTheme("all")} className={pill(theme === "all")}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setTheme(c)} className={pill(theme === c)}>
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} shown</span>
      </div>

      {catalog.isError ? (
        <PanelError />
      ) : catalog.isLoading && all.length === 0 ? (
        <PanelLoading label="Loading catalog…" />
      ) : rows.length === 0 ? (
        <PanelEmpty title="No matches" message="No series match the search or theme." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3">Indicator</TableHead>
                <TableHead className="px-3">QDF ticker</TableHead>
                <TableHead className="px-3">Theme</TableHead>
                <TableHead className="px-3">Market</TableHead>
                <TableHead className="px-3">Freq</TableHead>
                <TableHead className="px-3">Reliability</TableHead>
                <TableHead className="px-3">Licence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const rb = reliabilityBadge(s, relMap[s.series_id]);
                return (
                  <TableRow key={s.series_id} title={s.description}>
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
