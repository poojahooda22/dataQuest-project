import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Plus } from "lucide-react";

import { PanelEmpty } from "@/components/common/panel-state";
import { cn } from "@/lib/utils";
import type { ChangesResponse } from "@/types/api";

import { pct } from "./format";

// What changed between the two most recent rebalances: added / dropped / reweighted constituents.
// Empty until an index has at least two stored rebalances (the API returns an empty change set).
export function ChangesPanel({ changes }: { changes: ChangesResponse }) {
  if (!changes.from_rebalance || changes.changes.length === 0) {
    return (
      <PanelEmpty
        title="No rebalance to compare yet"
        message="Changes appear once this index has at least two monthly rebalances stored."
      />
    );
  }

  const added = changes.changes.filter((c) => c.kind === "added");
  const dropped = changes.changes.filter((c) => c.kind === "dropped");
  const reweighted = changes.changes.filter((c) => c.kind === "reweighted");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {changes.from_rebalance} → {changes.to_rebalance}
      </p>

      <ChangeGroup title="Added" icon={<Plus className="size-4 text-emerald-500" />} rows={added} />
      <ChangeGroup title="Dropped" icon={<Minus className="size-4 text-destructive" />} rows={dropped} />
      <ChangeGroup
        title="Reweighted"
        icon={<ArrowUpRight className="size-4 text-muted-foreground" />}
        rows={reweighted}
        showDelta
      />
    </div>
  );
}

function ChangeGroup({
  title,
  icon,
  rows,
  showDelta = false,
}: {
  title: string;
  icon: ReactNode;
  rows: ChangesResponse["changes"];
  showDelta?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium text-foreground">
        {icon}
        {title}
        <span className="text-muted-foreground">({rows.length})</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((c) => {
          const up = (c.new_weight ?? 0) > (c.old_weight ?? 0);
          return (
            <div key={c.constituent_id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{c.constituent_name}</span>
              {showDelta ? (
                <span
                  className={cn(
                    "flex items-center gap-1 tabular-nums",
                    up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                  )}
                >
                  {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {pct(c.old_weight ?? 0)} → {pct(c.new_weight ?? 0)}
                </span>
              ) : (
                <span className="tabular-nums text-muted-foreground">
                  {pct((c.new_weight ?? c.old_weight) ?? 0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
