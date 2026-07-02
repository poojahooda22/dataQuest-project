import { useMemo, useState } from "react";

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { RevisionBars } from "@/components/charts/revision-bars";
import { ConvergenceCurve } from "@/components/charts/convergence-curve";
import { RevisionTrack } from "@/components/charts/revision-track";
import { ReliabilityCard } from "@/components/insights/reliability-card";
import { ProvenanceLine } from "@/components/common/provenance-line";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { useCatalog } from "@/hooks/use-catalog";
import { usePanel } from "@/hooks/use-panel";
import { useRevisions } from "@/hooks/use-revisions";
import { useRevisionStats } from "@/hooks/use-revision-stats";
import { convergenceCurve, eventTrack, mostRevised } from "@/lib/revisions";
import { seriesName } from "@/lib/series-name";
import { formatValue } from "@/lib/format";
import type { NamedSeries } from "@/lib/echart-util";
import type { PanelPoint } from "@/types/api";

function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : iso;
}

// Revision as a % of the earlier level — the honest "how big was this change" scale.
function pctChange(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}
function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// Data Insights · Revision Comparison — the diff-two-vintages study on GET /series/{ticker}/panel.
// Pick a revisable series and two information-state dates; see how the number changed after first print.
// The global top-bar `search` filters the series picker (consistent with every other view).
export function RevisionComparison({ search = "" }: { search?: string }) {
  const catalog = useCatalog();
  const allSeries = useMemo(() => catalog.data ?? [], [catalog.data]);
  const vintageSeries = useMemo(() => allSeries.filter((s) => s.vintage_capable), [allSeries]);
  const pickerOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return vintageSeries;
    const hits = vintageSeries.filter((s) =>
      [seriesName(s), s.qdf_ticker ?? s.series_id, s.description].some((t) => t?.toLowerCase().includes(needle)),
    );
    return hits.length ? hits : vintageSeries; // never leave the picker empty — search narrows, not locks out
  }, [vintageSeries, search]);

  const [ticker, setTicker] = useState<string | undefined>(undefined);
  const [vintageA, setVintageA] = useState<string>(yearsAgo(4));
  const [vintageB, setVintageB] = useState<string>(""); // empty → today (backend default)

  const defaultTicker = useMemo(() => {
    if (vintageSeries.some((s) => s.series_id === "USD_CPIAUCSL")) return "USD_CPIAUCSL";
    return vintageSeries[0]?.series_id ?? "";
  }, [vintageSeries]);
  const activeTicker = ticker ?? defaultTicker;

  const panel = usePanel(activeTicker || undefined, vintageA, vintageB || undefined);
  const data = panel.data;
  const meta = vintageSeries.find((s) => s.series_id === activeTicker);

  // ── The vintage workbench (multi-vintage): convergence curve + fixed-event track ──
  const revStart = useMemo(() => yearsAgo(12), []);
  const revisions = useRevisions(activeTicker || undefined, revStart);
  const revStats = useRevisionStats(activeTicker || undefined);
  const revObs = useMemo(() => revisions.data?.observations ?? [], [revisions.data]);
  const convergence = useMemo(() => convergenceCurve(revObs), [revObs]);
  const periodOptions = useMemo(
    () => revObs.map((o) => o.observation_date).sort((a, b) => b.localeCompare(a)),
    [revObs],
  );
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const defaultPeriod = useMemo(() => mostRevised(revObs), [revObs]);
  const activePeriod = period && periodOptions.includes(period) ? period : defaultPeriod;
  const track = useMemo(() => (activePeriod ? eventTrack(revObs, activePeriod) : []), [revObs, activePeriod]);

  const lines = useMemo<NamedSeries[]>(() => {
    const pts = data?.points ?? [];
    const a = pts.flatMap((p) => (p.value_a != null ? [{ date: p.observation_date, value: p.value_a }] : []));
    const b = pts.flatMap((p) => (p.value_b != null ? [{ date: p.observation_date, value: p.value_b }] : []));
    const out: NamedSeries[] = [];
    if (a.length) out.push({ label: `As known on ${data?.vintage_a ?? "A"}`, points: a });
    if (b.length) out.push({ label: `As known on ${data?.vintage_b ?? "B"}`, points: b });
    return out;
  }, [data]);

  // Only the periods that ACTUALLY changed between the two vintages — a "revision per period" strip
  // should show revisions, not hundreds of zero-bars for periods that were already final (those would
  // stretch the time axis across the whole history and crush the real revisions into the right edge).
  const revPoints = useMemo(
    () =>
      (data?.points ?? []).flatMap((p) =>
        p.revision != null && p.revision !== 0 ? [{ date: p.observation_date, value: p.revision }] : [],
      ),
    [data],
  );

  // The single most-revised period in the current comparison — the headline readout. It changes
  // visibly the moment the dates change, so the calendar's effect is unmissable even for a series
  // (like CPI) whose revisions are tiny and vanish in the overlay chart.
  const headline = useMemo<PanelPoint | null>(() => {
    let best: PanelPoint | null = null;
    for (const p of data?.points ?? []) {
      if (p.revision != null && p.revision !== 0 && p.value_a != null && p.value_b != null) {
        if (!best || Math.abs(p.revision) > Math.abs(best.revision ?? 0)) best = p;
      }
    }
    return best;
  }, [data]);
  const headlinePct = headline ? pctChange(headline.value_a, headline.value_b) : null;
  const headlineUp = (headline?.revision ?? 0) >= 0;

  // Adaptive one-liner — answers "what is the point of these dates?" against the actual numbers:
  // a big mover reads as "provisional first print"; a tiny one reads as "reliable — and that's the finding".
  const explainer = useMemo(() => {
    if (!data) return "";
    const s = data.summary;
    const name = meta ? seriesName(meta) : "this series";
    if (s.n_revised === 0) {
      return `Nothing changed between these two dates — every period was already final as known on ${data.vintage_a}.`;
    }
    const hp = headline ? pctChange(headline.value_a, headline.value_b) : null;
    if (hp != null && Math.abs(hp) < 0.5) {
      return `Revisions to ${name} are small (largest ${Math.abs(hp).toFixed(2)}% of level) — the early prints were reliable, which is itself the finding. Try GDP or payrolls to see large revisions.`;
    }
    return `${s.n_revised} of ${s.n_compared} periods moved after first print — the advance readings were provisional. Move the "As known on" date to compare against a different information-state.`;
  }, [data, headline, meta]);

  const fmt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatValue(v));

  return (
    <div className="space-y-4 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-lg font-semibold">Revision Comparison</h1>
        <p className="text-sm text-muted-foreground">
          How a number changed after first publication — the same series as the world knew it on two different dates.
        </p>
      </div>

      {/* controls — the SERIES drives every card on this page; the two comparison dates live down in
          the "Vintage comparison" section they actually control (they do not affect the cards above). */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 px-3 py-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Series
          <Select value={activeTicker} onValueChange={setTicker}>
            <SelectTrigger size="sm" className="w-[230px]">
              <SelectValue placeholder="Pick a revisable series" />
            </SelectTrigger>
            <SelectContent>
              {pickerOptions.map((s) => (
                <SelectItem key={s.series_id} value={s.series_id}>
                  {seriesName(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {/* ── The vintage workbench (multi-vintage) — the moat screens ── */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reliability — can you trust the first print?</CardTitle>
        </CardHeader>
        <CardContent>
          <ReliabilityCard data={revStats.data} isLoading={revStats.isLoading} isError={revStats.isError} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Convergence — how fast {meta ? seriesName(meta) : "the number"} settles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revisions.isError ? (
              <PanelError />
            ) : revisions.isLoading && !revisions.data ? (
              <PanelLoading label="Loading revision history..." />
            ) : (
              <ConvergenceCurve points={convergence} />
            )}
            <p className="px-1 pt-2 text-[11px] leading-tight text-muted-foreground">
              Mean absolute revision (% of the latest value) still remaining at each release — lower means
              the early prints are trustworthy. Includes benchmark rebasing, not only data revisions.
            </p>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revision track — one period across every vintage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Period</span>
              <Select value={activePeriod ?? ""} onValueChange={setPeriod}>
                <SelectTrigger size="sm" className="w-[150px]">
                  <SelectValue placeholder="Pick a period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {track.length > 0 ? (
                <span className="text-xs text-muted-foreground/70">{track.length} vintages</span>
              ) : null}
            </div>
            {revisions.isError ? (
              <PanelError />
            ) : revisions.isLoading && !revisions.data ? (
              <PanelLoading label="Loading revision history..." />
            ) : (
              <RevisionTrack points={track} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Vintage comparison — ONE self-contained card. The two date pickers sit in its header and
             drive everything inside it; the headline readout directly below them changes the instant a
             date changes, so the control's effect is obvious. This is the ONLY surface the dates drive —
             the studies above use the full revision history and are series-driven. ── */}
      <Card className="flex flex-col">
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm">
              Vintage comparison — {meta ? seriesName(meta) : activeTicker}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                As known on
                <Input
                  type="date"
                  value={vintageA}
                  onChange={(e) => setVintageA(e.target.value)}
                  className="h-8 w-[150px]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                vs
                <Input
                  type="date"
                  value={vintageB}
                  onChange={(e) => setVintageB(e.target.value)}
                  className="h-8 w-[150px]"
                  aria-label="Second vintage (blank = today)"
                />
                <span className="text-muted-foreground/70">(blank = today)</span>
              </label>
              {panel.isFetching ? <span className="text-xs text-muted-foreground">updating…</span> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {panel.isError ? (
            <PanelError />
          ) : panel.isLoading && !data ? (
            <PanelLoading label="Loading revision comparison..." />
          ) : !data || lines.length === 0 ? (
            <PanelEmpty title="No data" message="No vintages for this series in the chosen window." />
          ) : (
            <>
              {/* headline — the single most-revised period; visibly changes when the dates change */}
              {headline ? (
                <div className="rounded-lg border border-border bg-secondary/40 p-4">
                  <div className="text-xs text-muted-foreground">
                    Biggest revision in this window · {monthLabel(headline.observation_date)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xs text-muted-foreground">as known {data.vintage_a}</span>
                    <span className="text-xl font-semibold tabular-nums">{fmt(headline.value_a)}</span>
                    <ArrowRight className="size-4 self-center text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">as known {data.vintage_b}</span>
                    <span className="text-xl font-semibold tabular-nums">{fmt(headline.value_b)}</span>
                    <Badge variant="badge" color={headlineUp ? "success" : "error"} size="sm">
                      {headlineUp ? "+" : ""}
                      {fmt(headline.revision)} ({fmtPct(headlinePct)})
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{explainer}</p>
                </div>
              ) : (
                <PanelEmpty
                  title="No revisions"
                  message="Every period was already final as of the earlier date — nothing was revised."
                />
              )}

              {/* summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Observations compared" value={String(data.summary.n_compared)} />
                <Stat label="Revised" value={String(data.summary.n_revised)} />
                <Stat label="Mean revision" value={fmt(data.summary.mean_revision)} />
                <Stat label="Mean abs revision" value={fmt(data.summary.mean_abs_revision)} />
                <Stat label="Max abs revision" value={fmt(data.summary.max_abs_revision)} />
              </div>

              {/* vintage overlay */}
              <div>
                <div className="mb-1 text-sm font-medium text-foreground">Vintage overlay</div>
                <TimeSeriesChart lines={lines} unit="value" height={360} />
              </div>

              {/* revision strip */}
              <div>
                <div className="mb-1 text-sm font-medium text-foreground">
                  Revision per period (later − earlier)
                </div>
                {revPoints.length ? (
                  <RevisionBars points={revPoints} height={200} />
                ) : (
                  <PanelEmpty title="No revisions" message="No period changed between these two vintages." />
                )}
              </div>

              <ProvenanceLine attribution={`${data.ticker}: ${data.attribution}`} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}