import { Boxes, Globe2, Landmark, type LucideIcon } from "lucide-react";

import { LicenseChip } from "@/components/common/license-chip";
import { cn } from "@/lib/utils";
import type { IndexSummary } from "@/types/api";

// One INDEX as a tile — mirrors the catalog ProductCard: a family glyph in a tinted well (top-left) +
// the commercial-display verdict (top-right) + title + description + a prominent constituent count.
const FAMILY_VISUAL: Record<string, { icon: LucideIcon; accent: string; tint: string }> = {
  Treasury: { icon: Landmark, accent: "text-indigo-500", tint: "bg-indigo-500/10" },
  "EMBI-class": { icon: Globe2, accent: "text-emerald-500", tint: "bg-emerald-500/10" },
};

export function IndexCard({
  index,
  onOpen,
}: {
  index: IndexSummary;
  onOpen: (id: string) => void;
}) {
  const v = FAMILY_VISUAL[index.family] ?? {
    icon: Boxes,
    accent: "text-muted-foreground",
    tint: "bg-muted",
  };
  const Icon = v.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(index.index_id)}
      className={cn(
        "group flex h-full w-full flex-col rounded-xl border border-border bg-card p-5 text-left shadow-sm",
        "transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex size-11 items-center justify-center rounded-lg", v.tint)}>
          <Icon className={cn("size-5", v.accent)} strokeWidth={1.75} />
        </div>
        <LicenseChip ok={index.commercial_ok} attribution={index.attribution} />
      </div>

      <h3 className="mt-4 text-base font-semibold text-foreground">{index.title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{index.universe}</p>
      {index.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{index.description}</p>
      ) : null}

      <div className="mt-auto flex items-baseline gap-1.5 pt-4 text-sm">
        <span className="font-semibold tabular-nums text-foreground">{index.n_eligible}</span>
        <span className="text-muted-foreground">constituents</span>
        {index.latest_rebalance ? (
          <span className="ml-auto text-xs text-muted-foreground">as of {index.latest_rebalance}</span>
        ) : null}
      </div>
    </button>
  );
}
