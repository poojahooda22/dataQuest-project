import type { Constituent } from "@/types/api";

import { fmtFace, pct } from "./format";

// The COMPOSITION: eligible constituents with their capped weight, shown as a proportional bar. Rows
// arrive pre-sorted by weight (the API orders eligible DESC, capped_weight DESC). Scrolls at Tier-1
// counts (hundreds of rows); virtualize before Tier-2.
export function CompositionTable({ constituents }: { constituents: Constituent[] }) {
  const eligible = constituents.filter((c) => c.eligible);
  const maxWeight = Math.max(...eligible.map((c) => c.capped_weight), 0.0001);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[1fr_90px_150px] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Constituent</span>
        <span className="text-right">Face</span>
        <span>Weight</span>
      </div>
      <div className="max-h-[560px] divide-y divide-border overflow-y-auto">
        {eligible.map((c) => (
          <div
            key={c.constituent_id}
            className="grid grid-cols-[1fr_90px_150px] items-center gap-3 px-4 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{c.constituent_name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{c.constituent_id}</div>
            </div>
            <span className="text-right tabular-nums text-muted-foreground">{fmtFace(c.face_amount)}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(c.capped_weight / maxWeight) * 100}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums text-xs text-foreground">
                {pct(c.capped_weight)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
