import { lazy, Suspense, useMemo, useState } from "react";
import { MotionConfig } from "motion/react";
import { Compass, Home, Library, Scale, Telescope } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { DataQuestMark, DataQuestWordmark } from "@/components/brand";
import { AnalysisDashboard } from "@/components/analysis/analysis-tab";
import { SearchBox } from "@/components/layout/search-box";
import { PageRise } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/api";

// Data Insights view — its own code-split chunk (keeps its ECharts imports out of the initial bundle).
const RevisionComparison = lazy(() =>
  import("@/components/insights/revision-comparison").then((m) => ({ default: m.RevisionComparison })),
);
// Open Data Exploration — the catalog/discovery view (its own chunk).
const DataExploration = lazy(() =>
  import("@/components/explore/data-exploration").then((m) => ({ default: m.DataExploration })),
);
// Data Catalog — the Fusion-style product-cards browse (its own chunk).
const CatalogTab = lazy(() =>
  import("@/components/catalog/catalog-tab").then((m) => ({ default: m.CatalogTab })),
);
// Index Lab — rules-based index construction (its own chunk; keeps its motion/table code out of initial).
const IndexLabTab = lazy(() =>
  import("@/components/index-lab/index-lab-tab").then((m) => ({ default: m.IndexLabTab })),
);

const MAX_SELECTED = 4;

// Add a series to the working set as a FIFO window: already-present → unchanged; otherwise append and,
// if that exceeds the cap, drop the OLDEST (first-in) so the newest is always kept and the set holds at
// MAX_SELECTED. This is why clicking a 5th indicator (from the catalog or the SGRID) no longer no-ops.
function addFifo(cur: Series[], s: Series): Series[] {
  if (cur.some((x) => x.series_id === s.series_id)) return cur;
  const next = [...cur, s];
  return next.length > MAX_SELECTED ? next.slice(next.length - MAX_SELECTED) : next;
}

type View = "home" | "insights" | "explore" | "catalog" | "index-lab";

// The sidebar is a FEATURES nav rail (Koyfin pattern): Home = the markets overview, Data Insights =
// the vintage/revision studies, Open Data Exploration = the catalog/discovery browser.
const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "catalog", label: "Data Catalog", icon: Library },
  { id: "index-lab", label: "Index Lab", icon: Scale },
  { id: "insights", label: "Data Insights", icon: Telescope },
  { id: "explore", label: "Open Data Exploration", icon: Compass },
];

export default function App() {
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Series[]>([]);
  const [search, setSearch] = useState("");
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.series_id)), [selected]);

  const toggle = (s: Series) =>
    setSelected((cur) =>
      cur.some((x) => x.series_id === s.series_id)
        ? cur.filter((x) => x.series_id !== s.series_id) // already selected → deselect (toggle off)
        : addFifo(cur, s), // not selected → add, FIFO-evicting the oldest if already at the cap
    );

  // The catalog→analysis handoff: clicking a series in Open Data Exploration ADDS it to the working set
  // (FIFO-evicting the oldest if at the cap, never toggling it off) and jumps to Home so the user lands
  // on it charted.
  const openInHome = (s: Series) => {
    setSelected((cur) => addFifo(cur, s));
    setView("home");
  };

  const sidebar = (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      {/* brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <DataQuestMark className="size-7 text-primary" />
        <DataQuestWordmark className="text-xl" />
      </div>

      {/* primary nav */}
      <nav className="flex flex-col gap-0.5 px-3 pt-2">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = view === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {n.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <MotionConfig reducedMotion="user">
    <AppShell
      sidebar={sidebar}
      header={
        <div className="flex flex-1 items-center gap-3">
          {/* ONE global search, on every view: filters the Home grid, the Catalog products/datasets,
              the Insights series picker, and the Explore table alike. */}
          <SearchBox value={search} onChange={setSearch} />
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      }
    >
      {/* Every view enters with the same quiet rise (keyed by view so switches re-run it). */}
      <PageRise key={view}>
        {view === "home" ? (
          <AnalysisDashboard selected={selected} selectedIds={selectedIds} onToggle={toggle} search={search} />
        ) : view === "catalog" ? (
          <Suspense fallback={<div className="px-6 pt-6 text-sm text-muted-foreground">Loading…</div>}>
            <CatalogTab search={search} onOpenInHome={openInHome} />
          </Suspense>
        ) : view === "index-lab" ? (
          <Suspense fallback={<div className="px-6 pt-6 text-sm text-muted-foreground">Loading…</div>}>
            <IndexLabTab search={search} />
          </Suspense>
        ) : view === "insights" ? (
          <Suspense fallback={<div className="px-6 pt-6 text-sm text-muted-foreground">Loading…</div>}>
            <RevisionComparison search={search} />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="px-6 pt-6 text-sm text-muted-foreground">Loading…</div>}>
            <DataExploration search={search} onOpenInHome={openInHome} />
          </Suspense>
        )}
      </PageRise>
    </AppShell>
    </MotionConfig>
  );
}