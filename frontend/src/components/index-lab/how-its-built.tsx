import { motion } from "motion/react";

import { DS_EASE, Stagger, StaggerItem } from "@/components/ui/motion";
import type { Constituent, IndexRules } from "@/types/api";

import { pct } from "./format";

// The showcase: the rules being applied, WHO was excluded and why (Step 1), and the weight + cap
// waterfall (Step 2) where the diversification cap visibly trims the largest issuers.
const WATERFALL_TOP = 15;

export function HowItsBuilt({
  rules,
  constituents,
}: {
  rules: IndexRules;
  constituents: Constituent[];
}) {
  const eligible = constituents.filter((c) => c.eligible);
  const excluded = constituents.filter((c) => !c.eligible);
  // Order the waterfall by RAW weight so the capped giants sit at the top; scale bars to the max raw.
  const byRaw = [...eligible].sort((a, b) => b.raw_weight - a.raw_weight).slice(0, WATERFALL_TOP);
  const maxRaw = Math.max(...byRaw.map((c) => c.raw_weight), 0.0001);
  const anyTrim = eligible.some((c) => c.raw_weight - c.capped_weight > 1e-9);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {rules.income_ceiling_usd != null ? (
          <RuleChip label="Income ceiling" value={`GNI/capita < $${rules.income_ceiling_usd.toLocaleString()} · 3 yrs`} />
        ) : null}
        {rules.min_face_usd_mn > 0 ? (
          <RuleChip label="Min size" value={`≥ $${rules.min_face_usd_mn.toLocaleString()}mn face`} />
        ) : null}
        {rules.min_maturity_years > 0 ? (
          <RuleChip label="Min maturity" value={`≥ ${rules.min_maturity_years}y at entry`} />
        ) : null}
        <RuleChip label="Cap" value={capLabel(rules)} />
      </div>

      <section>
        <h4 className="text-sm font-semibold text-foreground">Step 1 — Eligibility</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {eligible.length} of {constituents.length} passed the screens.
          {excluded.length ? ` ${excluded.length} excluded:` : ""}
        </p>
        {excluded.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <div className="max-h-56 divide-y divide-border overflow-y-auto">
              {excluded.map((c) => (
                <div key={c.constituent_id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.constituent_name}</span>
                  <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                    {c.eligibility_reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h4 className="text-sm font-semibold text-foreground">
          Step 2 — Weight{anyTrim ? " & diversification cap" : ""}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {anyTrim
            ? "Solid = final capped weight; the faint extension is the raw face weight the cap trimmed away."
            : "Face-amount weights (this index applies no diversification cap)."}
        </p>
        <Stagger className="mt-3 space-y-2">
          {byRaw.map((c) => {
            const cappedPct = (c.capped_weight / maxRaw) * 100;
            const trimPct = Math.max(0, ((c.raw_weight - c.capped_weight) / maxRaw) * 100);
            return (
              <StaggerItem key={c.constituent_id}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 truncate text-foreground sm:w-44">{c.constituent_name}</span>
                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${cappedPct}%` }}
                      transition={{ duration: 0.5, ease: DS_EASE }}
                    />
                    {trimPct > 0.1 ? (
                      <motion.div
                        className="h-full bg-primary/25"
                        initial={{ width: 0 }}
                        animate={{ width: `${trimPct}%` }}
                        transition={{ duration: 0.5, ease: DS_EASE }}
                      />
                    ) : null}
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums text-xs">
                    {trimPct > 0.1 ? (
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">{pct(c.capped_weight)}</span>{" "}
                        ← {pct(c.raw_weight)}
                      </span>
                    ) : (
                      <span className="text-foreground">{pct(c.capped_weight)}</span>
                    )}
                  </span>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>
    </div>
  );
}

function RuleChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function capLabel(rules: IndexRules): string {
  if (rules.cap_scheme === "ica") return "ICA (2× country average)";
  if (rules.cap_scheme === "pct") return `${((rules.cap_pct ?? 0) * 100).toFixed(0)}% per name`;
  return "none (pure face weight)";
}
