import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImageDown } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EChartHandle } from "@/components/charts/echart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { ExportBar } from "@/components/analysis/export-bar";
import { FilterBar } from "@/components/analysis/filter-bar";
import { OverviewTable } from "@/components/analysis/overview-table";
import { pct90 } from "@/components/analysis/change-cell";
import { ProvenanceLine } from "@/components/common/provenance-line";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { useCatalog } from "@/hooks/use-catalog";
import { useCompare } from "@/hooks/use-compare";
import { useObservations } from "@/hooks/use-observations";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { computeOverview } from "@/lib/overview";
import { seriesName } from "@/lib/series-name";
import { applyTransform, transformDef, RELATE_TRANSFORMS, SERIES_TRANSFORMS, type TransformId } from "@/lib/transforms";
import type { NamedSeries } from "@/lib/echart-util";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// Charts import ECharts; lazy-load them so the engine stays in a code-split chunk loaded on demand.
const TimeSeriesChart = lazy(() =>
  import("@/components/charts/time-series").then((m) => ({ default: m.TimeSeriesChart })),
);
const XYScatter = lazy(() => import("@/components/charts/xy-scatter").then((m) => ({ default: m.XYScatter })));
const RegressionChart = lazy(() =>
  import("@/components/charts/regression").then((m) => ({ default: m.RegressionChart })),
);
const BubbleChart = lazy(() => import("@/components/charts/bubble").then((m) => ({ default: m.BubbleChart })));
const SmallMultiples = lazy(() =>
  import("@/components/charts/small-multiples").then((m) => ({ default: m.SmallMultiples })),
);
const CorrelationHeatmap = lazy(() =>
  import("@/components/charts/correlation-heatmap").then((m) => ({ default: m.CorrelationHeatmap })),
);

const RANGES = ["1Y", "5Y", "10Y", "MAX"] as const;
type Range = (typeof RANGES)[number];

function startForRange(range: Range): string | undefined {
  if (range === "MAX") return undefined;
  const years = range === "1Y" ? 1 : range === "5Y" ? 5 : 10;
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// Extra lookback (days) a lagged transform needs BEFORE the visible window to compute its first shown
// point: "% change, year ago" needs a full prior year (so a 1Y view would otherwise be empty); the
// period-over-period transforms need ~one period (a quarter covers the coarsest, quarterly, case).
// Level/index need none — and index must NOT see the lookback, or its =100 base shifts off the window.
function lookbackDaysFor(id: TransformId): number {
  if (id === "pc1") return 430;
  if (id === "pch" || id === "chg" || id === "logdiff") return 120;
  return 0;
}

function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const CHART_H = 300;
const HERO_H = 420; // the normalized/levels chart — taller so it fills its widget cell (no bottom gap)

// A dashboard widget cell — a titled card that fills its grid cell; its chart fills the card.
function Widget({
  title,
  className,
  contentClassName,
  action,
  children,
}: {
  title: string;
  className?: string;
  contentClassName?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("min-h-0 flex-1", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

// A labeled series dropdown for the Advanced Charts tab — choose which series drives an axis.
function SeriesPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Series[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-[190px]">
          <SelectValue placeholder={`Select ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s.series_id} value={s.series_id}>
              {seriesName(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

// A compact transform selector — choose how a series is expressed (level / % change / log change / …).
function TransformSelect({
  value,
  onChange,
  options,
}: {
  value: TransformId;
  onChange: (v: TransformId) => void;
  options: TransformId[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span>Transform</span>
      <Select value={value} onValueChange={(v) => onChange(v as TransformId)}>
        <SelectTrigger size="sm" className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((id) => (
            <SelectItem key={id} value={id}>
              {transformDef(id).label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

// A header icon-button that saves a chart as a PNG (the chart exposes exportPNG via ref).
function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Save chart as image"
      title="Save as image"
    >
      <ImageDown className="size-4" />
    </button>
  );
}

// The Home view, JPM-DataQuery style: the search lives in the top bar (header); below it a
// Dashboard-Filters row, then dashboard TABS, each rendering a 3-column widget grid. All from our API.
export function AnalysisDashboard({
  selected,
  selectedIds,
  onToggle,
  search,
}: {
  selected: Series[];
  selectedIds: Set<string>;
  onToggle: (s: Series) => void;
  search: string;
}) {
  // ── Catalog + per-series stats (latest + 1M/3M/1Y change) ───────────────────
  const catalog = useCatalog();
  const allSeries = useMemo(() => catalog.data ?? [], [catalog.data]);
  // ~2 years back so the 1Y change resolves for every frequency; raw rows (no downsampling).
  const overviewStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 750);
    return d.toISOString().slice(0, 10);
  }, []);
  const tickers = useMemo(() => allSeries.map((s) => s.series_id), [allSeries]);
  const obs = useObservations(tickers, overviewStart);
  const stats = useMemo(() => computeOverview(allSeries, obs.data ?? []), [allSeries, obs.data]);

  // Per-column tint scale over the FULL set (so a cell's colour doesn't shift when you filter).
  const changeScale = useMemo(
    () => ({
      m1: pct90(stats.map((s) => s.chg1m)),
      m3: pct90(stats.map((s) => s.chg3m)),
      y1: pct90(stats.map((s) => s.chg1y)),
    }),
    [stats],
  );

  // ── Dashboard Filters (dropdowns; search comes from the top bar via props) ──
  const [cid, setCid] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [freq, setFreq] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const cids = useMemo(() => [...new Set(allSeries.map((s) => s.cid))].sort(), [allSeries]);
  const sources = useMemo(() => [...new Set(allSeries.map((s) => s.source))].sort(), [allSeries]);
  const frequencies = useMemo(() => [...new Set(allSeries.map((s) => s.frequency))].sort(), [allSeries]);
  const clearFilters = () => {
    setCid(undefined);
    setSource(undefined);
    setFreq(undefined);
    setCategory(undefined);
  };

  const filteredStats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.filter((st) => {
      const s = st.series;
      if (cid && s.cid !== cid) return false;
      if (source && s.source !== source) return false;
      if (freq && s.frequency !== freq) return false;
      if (category && categoryOf(s) !== category) return false;
      if (
        q &&
        !(
          seriesName(s).toLowerCase().includes(q) ||
          s.series_id.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.xcat.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [stats, cid, source, freq, category, search]);

  // ── Widget Types: Normalized Performance chart (driven by the SGRID selection) ──
  const [range, setRange] = useState<Range>("5Y");
  const [heroOverride, setHeroOverride] = useState<TransformId | undefined>(undefined);
  const chartRef = useRef<EChartHandle>(null);
  const scatterRef = useRef<EChartHandle>(null);
  const regressionRef = useRef<EChartHandle>(null);
  const bubbleRef = useRef<EChartHandle>(null);
  // Default to recognizable LEVEL series (regime A) so the index-to-100 chart compares cleanly —
  // never a near-zero-base rate by default (that would explode the axis).
  const defaultMeta = useMemo(() => {
    const want = ["USD_CPIAUCSL", "USD_GDPC1", "USD_INDPRO", "USD_PAYEMS"];
    const picks = want.map((id) => allSeries.find((s) => s.series_id === id)).filter((s): s is Series => !!s);
    return picks.length ? picks : allSeries.filter((s) => s.regime === "A").slice(0, 4);
  }, [allSeries]);
  const chartMeta = selected.length > 0 ? selected : defaultMeta;
  const chartTickers = useMemo(() => chartMeta.map((s) => s.series_id), [chartMeta]);

  // The regime-aware default transform is the DEFAULT; a user pick (heroOverride) overrides it. Clear
  // that override when the charted SELECTION changes, so a new set re-applies its regime default —
  // otherwise a stale "level" pick would silently disable the auto-index on the next selection forever.
  const chartKey = chartTickers.join(",");
  useEffect(() => {
    setHeroOverride(undefined);
  }, [chartKey]);

  // Rates/FX (regime B, already comparable units) → raw levels; revisable statistics → index to 100.
  // That regime rule is the DEFAULT; an explicit user pick (heroOverride) wins. Resolve it BEFORE the
  // fetch, because a lagged transform needs the fetch window widened by its lookback.
  const allMarket = chartMeta.length > 0 && chartMeta.every((s) => s.regime === "B");
  const chartTransform: TransformId = heroOverride ?? (allMarket ? "level" : "index");
  const chartDef = transformDef(chartTransform);

  // The range pills bound the DISPLAY window; for a lagged transform we fetch a lookback BEFORE it so the
  // first shown point can be computed, then clip back to the window below. MAX (undefined start) already
  // fetches everything, so no widening is needed there.
  const displayStart = startForRange(range);
  const lookbackDays = lookbackDaysFor(chartTransform);
  const fetchStart = displayStart && lookbackDays ? minusDays(displayStart, lookbackDays) : displayStart;
  const results = useCompare(chartTickers, fetchStart);
  const anyLoading = results.some((r) => r?.isLoading);
  const anyError = results.some((r) => r?.isError);

  const sig = `${chartTickers.join(",")}|${range}|${chartTransform}|${results
    .map((r) => r?.dataUpdatedAt ?? 0)
    .join(",")}`;
  const named = useMemo<NamedSeries[]>(() => {
    return chartMeta.flatMap((s, i) => {
      const data = results[i]?.data;
      if (!data) return [];
      let points = applyTransform(data.observations, chartTransform, s.frequency);
      // Drop the lookback rows we fetched only to seed the lagged transform — show just the display window.
      if (lookbackDays && displayStart) points = points.filter((p) => p.date >= displayStart);
      return [{ label: seriesName(s), points }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures tickers + range + transform + freshness
  }, [sig]);

  // Co-movement is ALWAYS computed on % change — a correlation of two trending LEVELS is the textbook
  // spurious result. Clip to the display window so the matrix reflects the selected period.
  const corrSeries = useMemo<NamedSeries[]>(() => {
    return chartMeta.flatMap((s, i) => {
      const data = results[i]?.data;
      if (!data) return [];
      let points = applyTransform(data.observations, "pch", s.frequency);
      if (displayStart) points = points.filter((p) => p.date >= displayStart);
      return [{ label: seriesName(s), points }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures tickers + range + freshness
  }, [sig]);

  // ── Advanced Charts: SELF-CONTAINED — its own X/Y/Size pickers, not the SGRID selection ──
  const [advX, setAdvX] = useState<string | undefined>(undefined);
  const [advY, setAdvY] = useState<string | undefined>(undefined);
  const [advZ, setAdvZ] = useState<string | undefined>(undefined);
  const [advTransform, setAdvTransform] = useState<TransformId>("level");
  // Sensible defaults until the user picks; resolve once the catalog loads.
  const advDefaults = useMemo(() => {
    const want = ["USD_CPIAUCSL", "USD_GDPC1", "USD_PAYEMS"];
    const present = want.filter((id) => allSeries.some((s) => s.series_id === id));
    const fallback = allSeries.map((s) => s.series_id);
    const pick = (i: number) => present[i] ?? fallback[i] ?? "";
    return [pick(0), pick(1), pick(2)] as const;
  }, [allSeries]);
  const xId = advX ?? advDefaults[0];
  const yId = advY ?? advDefaults[1];
  const zId = advZ ?? advDefaults[2];

  const advTickers = useMemo(() => [xId, yId, zId].filter(Boolean), [xId, yId, zId]);
  const advResults = useCompare(advTickers, startForRange("10Y")); // a 10Y window gives the relate views enough points
  const advMeta = useMemo(() => advTickers.map((id) => allSeries.find((s) => s.series_id === id)), [advTickers, allSeries]);
  const advSig = `${advTickers.join(",")}|${advTransform}|${advResults.map((r) => r?.dataUpdatedAt ?? 0).join(",")}`;
  const advLeveled = useMemo<(NamedSeries | null)[]>(() => {
    const suffix = advTransform === "level" ? "" : ` (${transformDef(advTransform).label})`;
    return advTickers.map((_id, i) => {
      const s = advMeta[i];
      const data = advResults[i]?.data;
      return s && data
        ? { label: seriesName(s) + suffix, points: applyTransform(data.observations, advTransform, s.frequency) }
        : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `advSig` captures tickers + transform + data freshness
  }, [advSig]);
  const [advA, advB, advC] = advLeveled;
  const advBusy = advResults.some((r) => r?.isLoading);

  function heroBody() {
    if (anyError && named.length === 0) return <PanelError />;
    if (anyLoading && named.length === 0) return <PanelLoading label="Loading..." />;
    if (named.length === 0) return <PanelEmpty title="No data" message="Pick an indicator from the table." />;
    return (
      <Suspense fallback={<PanelLoading label="Loading chart..." />}>
        <TimeSeriesChart ref={chartRef} lines={named} unit={chartDef.unit} height={HERO_H} />
      </Suspense>
    );
  }

  // A relate-chart slot: loading → spinner; ready → chart; otherwise → empty hint.
  function relateBody(ready: boolean, chart: ReactNode, emptyTitle: string, emptyMsg: string) {
    if (advBusy && !advA) return <PanelLoading label="Loading..." />;
    if (ready) return <Suspense fallback={<PanelLoading label="Loading chart..." />}>{chart}</Suspense>;
    return <PanelEmpty title={emptyTitle} message={emptyMsg} />;
  }

  function smallMultiplesBody() {
    if (anyError && named.length === 0) return <PanelError />;
    if (anyLoading && named.length === 0) return <PanelLoading label="Loading..." />;
    if (named.length === 0) return <PanelEmpty title="No data" message="Pick indicators from the table." />;
    return (
      <Suspense fallback={<PanelLoading label="Loading charts..." />}>
        <SmallMultiples series={named} />
      </Suspense>
    );
  }

  function correlationBody() {
    if (anyError && corrSeries.length === 0) return <PanelError />;
    if (anyLoading && corrSeries.length === 0) return <PanelLoading label="Loading..." />;
    if (corrSeries.length < 2)
      return <PanelEmpty title="Need ≥2 series" message="Select at least two indicators to correlate." />;
    return (
      <Suspense fallback={<PanelLoading label="Loading chart..." />}>
        <CorrelationHeatmap series={corrSeries} />
      </Suspense>
    );
  }

  const rangePills = (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRange(r)}
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium transition-colors",
            r === range ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );

  // Provenance for EVERY charted series across both tabs (deduped) — the attribution gate.
  const provLines: [string, string][] = (() => {
    const map = new Map<string, string>();
    chartMeta.forEach((s, i) => {
      const d = results[i]?.data;
      if (d) map.set(s.series_id, `${s.series_id}: ${d.attribution}`);
    });
    advMeta.forEach((s, i) => {
      const d = advResults[i]?.data;
      if (s && d) map.set(s.series_id, `${s.series_id}: ${d.attribution}`);
    });
    return [...map.entries()];
  })();

  return (
    <div className="space-y-4 px-4 pb-12 sm:px-6 lg:px-8">
      {/* ── Dashboard Filters (dropdowns; search is in the top bar) ────────── */}
      <FilterBar
        cid={cid}
        onCid={setCid}
        source={source}
        onSource={setSource}
        freq={freq}
        onFreq={setFreq}
        category={category}
        onCategory={setCategory}
        cids={cids}
        sources={sources}
        frequencies={frequencies}
        categories={CATEGORIES}
        onClear={clearFilters}
      />

      {/* ── Dashboard tabs → a 3-column widget grid per tab (JPM DataQuery style) ── */}
      <Tabs defaultValue="widgets" type="underline" className="space-y-4">
        <TabsList className="border-b border-border">
          <TabsTrigger value="widgets">Widget Types</TabsTrigger>
          <TabsTrigger value="advanced">Advanced Charts</TabsTrigger>
        </TabsList>

        {/* Widget Types — the data grid: the SGRID (wide) + the performance chart */}
        <TabsContent value="widgets" className="space-y-4">
          {selected.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Showing 4 example indicators — pick rows from the table to chart your own.
            </p>
          ) : null}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Widget
              title={`Indicators · ${filteredStats.length}`}
              className="lg:col-span-2"
              contentClassName="p-0"
            >
              <div className="max-h-[440px] overflow-auto">
                <OverviewTable
                  stats={filteredStats}
                  scales={changeScale}
                  selectedIds={selectedIds}
                  onSelect={onToggle}
                  isLoading={catalog.isLoading || obs.isLoading}
                  isError={catalog.isError || obs.isError}
                />
              </div>
            </Widget>

            <Widget
              title={
                chartTransform === "index"
                  ? "Normalized · indexed to 100"
                  : chartTransform === "level"
                    ? "Levels (raw values)"
                    : chartDef.label
              }
              action={
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <TransformSelect value={chartTransform} onChange={setHeroOverride} options={SERIES_TRANSFORMS} />
                  {rangePills}
                  <ExportButton onClick={() => chartRef.current?.exportPNG(chartTransform)} />
                </div>
              }
            >
              {heroBody()}
            </Widget>
          </div>

          {/* Second row — densify the board: faceted small multiples + the co-movement heatmap */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <Widget title="Small multiples">{smallMultiplesBody()}</Widget>
            <Widget title="Correlation · % change">{correlationBody()}</Widget>
          </div>
        </TabsContent>

        {/* Advanced Charts — self-contained: its OWN series pickers drive the relate views */}
        <TabsContent value="advanced">
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">Does one series drive another?</span>
            <SeriesPicker label="X" value={xId} onChange={setAdvX} options={allSeries} />
            <SeriesPicker label="Y" value={yId} onChange={setAdvY} options={allSeries} />
            <SeriesPicker label="Size" value={zId} onChange={setAdvZ} options={allSeries} />
            <TransformSelect value={advTransform} onChange={setAdvTransform} options={RELATE_TRANSFORMS} />
            <div className="ml-auto">
              <ExportBar rows={advA?.points ?? []} filename={`${advA?.label ?? "series"}_${advTransform}`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Widget
              title="Scatter"
              action={<ExportButton onClick={() => scatterRef.current?.exportPNG("scatter")} />}
            >
              {relateBody(
                !!(advA && advB),
                advA && advB ? <XYScatter ref={scatterRef} x={advA} y={advB} height={CHART_H} /> : null,
                "Pick series",
                "Choose two series to compare — e.g. CPI vs Payrolls.",
              )}
            </Widget>
            <Widget
              title="Regression"
              action={<ExportButton onClick={() => regressionRef.current?.exportPNG("regression")} />}
            >
              {relateBody(
                !!(advA && advB),
                advA && advB ? <RegressionChart ref={regressionRef} x={advA} y={advB} height={CHART_H} /> : null,
                "Pick series",
                "Choose two series to compare — e.g. CPI vs Payrolls.",
              )}
            </Widget>
            <Widget
              title="Bubble"
              action={<ExportButton onClick={() => bubbleRef.current?.exportPNG("bubble")} />}
            >
              {relateBody(
                !!(advA && advB && advC),
                advA && advB && advC ? <BubbleChart ref={bubbleRef} x={advA} y={advB} size={advC} height={CHART_H} /> : null,
                "Pick 3 series",
                "Pick three series — X, Y, and bubble size.",
              )}
            </Widget>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Provenance — one source line per charted series (both tabs, deduped) ─── */}
      <div className="space-y-1 pt-2">
        {provLines.map(([id, attribution]) => (
          <ProvenanceLine key={id} attribution={attribution} />
        ))}
      </div>
    </div>
  );
}