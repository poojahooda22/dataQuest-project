import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useCatalogChanges } from "@/hooks/use-catalog-changes";
import { categoryOf } from "@/lib/categories";
import { seriesName } from "@/lib/series-name";
import { themeVisual } from "@/lib/theme-visual";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// "Recently updated" — the changes feed on the catalog landing: which datasets the SOURCES published new
// information-states for, newest first (vintage_date is the upstream publication event, so this is honest
// "what changed in the data", not our ingest times). Clicking a row opens the dataset detail. Renders
// nothing while loading/on error/when empty — the strip is an enhancement, never a blocker.
export function RecentChanges({ onOpenDataset }: { onOpenDataset: (s: Series) => void }) {
  const { data } = useCatalogChanges(8);
  const changes = data?.changes ?? [];
  if (changes.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <RefreshCw className="size-3.5 text-muted-foreground" /> Recently updated
        <span className="text-xs font-normal text-muted-foreground">· since {data!.since}</span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        {changes.map((c, i) => {
          const tv = themeVisual(categoryOf(c.series));
          const Icon = tv.icon;
          return (
            <button
              key={c.series.series_id}
              type="button"
              onClick={() => onOpenDataset(c.series)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
                i > 0 && "border-t border-border",
              )}
            >
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", tv.tint)}>
                <Icon className={cn("size-3.5", tv.accent)} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {seriesName(c.series)}
              </span>
              <Badge variant="badge" color="gray" size="sm">{c.series.source}</Badge>
              <Badge variant="badge" color="brand" size="sm">
                {c.new_observations} new
              </Badge>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.latest_vintage}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
