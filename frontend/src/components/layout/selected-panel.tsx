import { X } from "lucide-react";

import { seriesName } from "@/lib/series-name";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// The cleaned sidebar's job: the user's active working set. Filters moved to the top filter bar and
// the catalog moved to the Overview table; the sidebar now tracks which series are charted, with a
// remove + clear-all. Genuinely useful and persistent while you browse — not a filter.
export function SelectedPanel({
  selected,
  onRemove,
  onClear,
  max,
}: {
  selected: Series[];
  onRemove: (id: string) => void;
  onClear: () => void;
  max: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Selected · {selected.length}/{max}
        </span>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          No series selected yet. Click a row in the <span className="font-medium text-foreground">Overview</span>{" "}
          table to add it here and chart it.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {selected.map((s) => (
            <li key={s.series_id}>
              <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-sidebar-foreground">{seriesName(s)}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.series_id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(s.series_id)}
                  aria-label={`Remove ${s.series_id}`}
                  className={cn(
                    "shrink-0 rounded p-0.5 text-muted-foreground transition-colors",
                    "hover:bg-sidebar-accent hover:text-foreground",
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
