import { useMemo } from "react";
import { ArrowLeft, BookOpenText, Braces, Download, Eye, History, LineChart as LineChartIcon, Table2 } from "lucide-react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import { ConvergenceCurve } from "@/components/charts/convergence-curve";
import { LicenseChip } from "@/components/common/license-chip";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { ReliabilityCard } from "@/components/insights/reliability-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDatasetAttributes } from "@/hooks/use-dataset-attributes";
import { useRevisions } from "@/hooks/use-revisions";
import { useRevisionStats } from "@/hooks/use-revision-stats";
import { useSeries } from "@/hooks/use-series";
import { BACKEND_URL } from "@/lib/config";
import { formatValue } from "@/lib/format";
import { categoryOf } from "@/lib/categories";
import { convergenceCurve } from "@/lib/revisions";
import { seriesName } from "@/lib/series-name";
import { themeVisual } from "@/lib/theme-visual";
import { cn } from "@/lib/utils";
import type { NamedSeries } from "@/lib/echart-util";
import type { Series } from "@/types/api";

const FREQ_LABEL: Record<string, string> = { D: "Daily", W: "Weekly", M: "Monthly", Q: "Quarterly", A: "Annual" };

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// A small header stat block — label over value, spec-sheet style.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

// The dataset DETAIL page — the catalog journey's missing step: one dataset presented as a product
// (header + stat cards + tabs: Overview · Data preview · Data dictionary · Vintages & revisions · Access)
// instead of ejecting the user to Home on click. "Chart on Home" remains an explicit action.
export function DatasetDetail({
  series,
  onBack,
  onOpenInHome,
}: {
  series: Series;
  onBack: () => void;
  onOpenInHome: (s: Series) => void;
}) {
  const tv = themeVisual(categoryOf(series));
  const Icon = tv.icon;

  // Chart query: full range, server-side LTTB to chart resolution (endpoints preserved).
  const chart = useSeries({ ticker: series.series_id, maxPoints: 800 });
  // Preview query: recent window at native resolution — raw rows, never downsampled.
  const preview = useSeries({ ticker: series.series_id, start: isoDaysAgo(1095) });
  const attrs = useDatasetAttributes(series.series_id);
  const revisions = useRevisions(series.vintage_capable ? series.series_id : undefined);
  const revStats = useRevisionStats(series.vintage_capable ? series.series_id : undefined);

  const lines = useMemo<NamedSeries[]>(() => {
    const obs = chart.data?.observations ?? [];
    return [{ label: seriesName(series), points: obs.map((o) => ({ date: o.observation_date, value: o.value })) }];
  }, [chart.data, series]);

  const coverage = useMemo(() => {
    const obs = chart.data?.observations ?? [];
    if (obs.length === 0) return "—";
    return `${obs[0]!.observation_date.slice(0, 4)} – ${obs[obs.length - 1]!.observation_date.slice(0, 4)}`;
  }, [chart.data]);

  const previewRows = useMemo(() => {
    const obs = preview.data?.observations ?? [];
    return obs.slice(-20).reverse(); // newest first
  }, [preview.data]);

  const convergence = useMemo(
    () => convergenceCurve(revisions.data?.observations ?? []),
    [revisions.data],
  );

  const restUrl = `${BACKEND_URL}/api/v1/series/${series.series_id}`;
  const attrsUrl = `${BACKEND_URL}/api/v1/datasets/${series.series_id}/attributes`;
  const qdfUrl = series.qdf_ticker ? `${BACKEND_URL}/api/v1/qdf?tickers=${series.qdf_ticker}` : null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to datasets
      </button>

      {/* header — the dataset as a product with a face */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", tv.tint)}>
            <Icon className={cn("size-5", tv.accent)} strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{seriesName(series)}</h2>
              <Badge variant="badge" color="gray" size="sm">{series.source}</Badge>
              <LicenseChip ok={series.commercial_ok} attribution={series.attribution} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{series.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenInHome(series)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium",
            "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          <LineChartIcon className="size-4" /> Chart on Home
        </button>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Coverage" value={coverage} />
        <Stat label="Frequency" value={FREQ_LABEL[series.frequency] ?? series.frequency} />
        <Stat label="Revision profile" value={series.vintage_capable ? "Revisable · vintages" : "Market · final"} />
        <Stat label="File download" value={series.downloadable ? "Available" : "View only"} />
      </div>

      <Tabs defaultValue="overview" type="underline">
        <TabsList className="border-b border-border">
          <TabsTrigger value="overview"><Eye /> Overview</TabsTrigger>
          <TabsTrigger value="preview"><Table2 /> Data preview</TabsTrigger>
          <TabsTrigger value="dictionary"><BookOpenText /> Data dictionary</TabsTrigger>
          {series.vintage_capable ? (
            <TabsTrigger value="vintages"><History /> Vintages & revisions</TabsTrigger>
          ) : null}
          <TabsTrigger value="access"><Braces /> Access</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          {chart.isError ? (
            <PanelError />
          ) : chart.isLoading && !chart.data ? (
            <PanelLoading label="Loading series…" />
          ) : (
            <div className="space-y-2">
              <TimeSeriesChart lines={lines} height={320} />
              <p className="text-xs text-muted-foreground">{series.attribution}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="pt-4">
          {preview.isError ? (
            <PanelError />
          ) : preview.isLoading && !preview.data ? (
            <PanelLoading label="Loading observations…" />
          ) : previewRows.length === 0 ? (
            <PanelEmpty title="No recent data" message="No observations in the last 3 years." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3">Observation date</TableHead>
                    <TableHead className="px-3">Value</TableHead>
                    <TableHead className="px-3">Vintage date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((o) => (
                    <TableRow key={`${o.observation_date}-${o.vintage_date}`}>
                      <TableCell className="px-3 py-1.5 font-mono text-xs">{o.observation_date}</TableCell>
                      <TableCell className="px-3 py-1.5 tabular-nums">{formatValue(o.value)}</TableCell>
                      <TableCell className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{o.vintage_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                Latest 20 observations (native resolution) as known today — pass <code>as_of</code> to the API to
                read the series as it was known on any past date.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dictionary" className="pt-4">
          {attrs.isError ? (
            <PanelError />
          ) : attrs.isLoading && !attrs.data ? (
            <PanelLoading label="Loading data dictionary…" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3">Field</TableHead>
                    <TableHead className="px-3">Type</TableHead>
                    <TableHead className="px-3">Key</TableHead>
                    <TableHead className="px-3">Description</TableHead>
                    <TableHead className="px-3">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(attrs.data?.attributes ?? []).map((a) => (
                    <TableRow key={a.identifier}>
                      <TableCell className="px-3 py-2 font-mono text-xs font-medium text-foreground">{a.identifier}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{a.dataType}</TableCell>
                      <TableCell className="px-3 py-2">
                        {a.isDatasetKey ? <Badge variant="badge" color="blue" size="sm">key</Badge> : null}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground">{a.description}</TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground">{a.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {series.vintage_capable ? (
          <TabsContent value="vintages" className="space-y-4 pt-4">
            <ReliabilityCard data={revStats.data} isLoading={revStats.isLoading} isError={revStats.isError} />
            {revisions.isError ? null : revisions.isLoading && !revisions.data ? (
              <PanelLoading label="Loading vintages…" />
            ) : (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">Convergence — how fast estimates settle</p>
                <ConvergenceCurve points={convergence} height={240} />
              </div>
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="access" className="pt-4">
          <div className="space-y-2">
            {series.downloadable ? (
              <a
                href={`${BACKEND_URL}/api/v1/datasets/${series.series_id}/download.csv`}
                download
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
                  "transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                )}
              >
                <Download className="size-4" /> Download CSV
              </a>
            ) : null}
            {[
              { label: "Point-in-time series (JSON)", url: `${restUrl}?as_of=YYYY-MM-DD` },
              { label: "Data dictionary (JSON)", url: attrsUrl },
              ...(qdfUrl ? [{ label: "QDF — loads in the macrosynergy package", url: qdfUrl }] : []),
              { label: "Catalog metadata (DCAT JSON-LD)", url: `${BACKEND_URL}/api/v1/catalog.jsonld` },
            ].map((row) => (
              <div key={row.label} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">{row.label}</p>
                <code className="mt-0.5 block break-all text-xs text-foreground">{row.url}</code>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              {series.downloadable
                ? "This series is cleared for file redistribution (source licence permits reuse with attribution)."
                : "View/query only — the source licence does not permit redistributing this series as a file."}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
