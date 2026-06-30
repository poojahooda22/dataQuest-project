import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import type { RevisionBiasTest, RevisionStats, RevisionStatsResponse } from "@/types/api";

const n2 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const signed = (v: number) => (v >= 0 ? "+" : "") + n2(v);

function statsOk(r: RevisionStatsResponse): r is RevisionStats {
  return "bias_test" in r;
}

// A compact horizontal interval: the mean-revision point estimate with its CI whisker against a zero
// reference. The honesty mechanism — when the whisker crosses 0 the bias is not distinguishable from
// zero, and you SEE it. Inline SVG (one interval doesn't warrant an ECharts instance).
function BiasInterval({
  ciLow,
  ciHigh,
  mr,
  significant,
}: {
  ciLow: number;
  ciHigh: number;
  mr: number;
  significant: boolean | null;
}) {
  const w = 300;
  const h = 40;
  const padX = 10;
  const lo = Math.min(ciLow, 0);
  const hi = Math.max(ciHigh, 0);
  const span = hi - lo || 1;
  const sx = (v: number) => padX + ((v - lo) / span) * (w - 2 * padX);
  const zeroX = sx(0);
  const x0 = sx(ciLow);
  const x1 = sx(ciHigh);
  const xm = sx(mr);
  const cy = h / 2 - 3;
  const color = significant ? "rgb(16, 185, 129)" : "rgb(148, 163, 184)"; // emerald (real bias) vs slate
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="max-w-full text-muted-foreground" role="img" aria-label="mean revision confidence interval">
      <line x1={zeroX} y1={4} x2={zeroX} y2={h - 10} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
      <text x={zeroX} y={h - 1} fontSize={8} textAnchor="middle" fill="currentColor" opacity={0.5}>0</text>
      <line x1={x0} y1={cy} x2={x1} y2={cy} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <line x1={x0} y1={cy - 5} x2={x0} y2={cy + 5} stroke={color} strokeWidth={1.5} />
      <line x1={x1} y1={cy - 5} x2={x1} y2={cy + 5} stroke={color} strokeWidth={1.5} />
      <circle cx={xm} cy={cy} r={3.5} fill={color} />
    </svg>
  );
}

function gateBadge(bt: RevisionBiasTest): { text: string; cls: string } {
  const amber = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const muted = "bg-muted text-muted-foreground";
  if (bt.verdict === "test") {
    return bt.significant
      ? { text: "Bias detected (95%)", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" }
      : { text: "No detectable bias", cls: muted };
  }
  if (bt.verdict === "estimate_only") {
    return bt.gate_reason === "high_persistence"
      ? { text: `Strongly autocorrelated (${bt.rho_hat_1?.toFixed(2)}) — not testable at 5%`, cls: amber }
      : { text: `Insufficient vintages (n=${bt.n}) — estimate only`, cls: amber };
  }
  if (bt.verdict === "no_variation") return { text: "No variation", cls: muted };
  return { text: "Too few revisions to test", cls: amber };
}

// The reliability readout + the sample-AND-persistence-gated bias estimate. Renders only what the
// endpoint computed (the bias test, gating, and the readout sentence are all server-side).
export function ReliabilityCard({
  data,
  isLoading,
  isError,
}: {
  data: RevisionStatsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isError) return <PanelError />;
  if (isLoading && !data) return <PanelLoading label="Computing revision diagnostics..." />;
  if (!data) return <PanelEmpty title="No data" message="Pick a revisable series." />;
  if (!statsOk(data)) {
    return <PanelEmpty title="No revisions" message="No observation in this series was revised within a year of first publication." />;
  }

  const bt = data.bias_test;
  const badge = gateBadge(bt);
  const hasCI = bt.ci_low != null && bt.ci_high != null;
  const lowPower = bt.verdict === "test" && bt.significant === false && (bt.df_b ?? 0) < 8 && bt.mde != null;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-foreground">{data.readout}</p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {hasCI ? (
          <div>
            <BiasInterval ciLow={bt.ci_low!} ciHigh={bt.ci_high!} mr={data.mr} significant={bt.significant} />
            <p className="px-1 text-[11px] text-muted-foreground">
              mean revision {signed(data.mr)} · 95% CI {signed(bt.ci_low!)} to {signed(bt.ci_high!)}
            </p>
          </div>
        ) : null}
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
      </div>

      {lowPower ? (
        <p className="text-[11px] leading-tight text-muted-foreground">
          Limited power: a true bias up to ±{n2(bt.mde!)} would not be detected at this sample size.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          typical revision <b className="tabular-nums text-foreground">{n2(data.mar)}</b>
        </span>
        <span>
          RMS <b className="tabular-nums text-foreground">{n2(data.rmsr)}</b>
        </span>
        <span>
          revised <b className="tabular-nums text-foreground">{data.n_revision_events}/{data.N}</b>
        </span>
        {data.rho_hat_1 != null ? (
          <span>
            lag-1 autocorr <b className="tabular-nums text-foreground">{data.rho_hat_1.toFixed(2)}</b>
          </span>
        ) : null}
        {data.frac_correct_sign != null ? (
          <span>
            sign correct <b className="tabular-nums text-foreground">{Math.round(data.frac_correct_sign * 100)}%</b>
          </span>
        ) : null}
        {data.benchmark_excluded > 0 ? <span>{data.benchmark_excluded} base-changes excluded</span> : null}
      </div>
    </div>
  );
}
