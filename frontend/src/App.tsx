import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Home, Telescope } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { DataQuestMark, DataQuestWordmark } from "@/components/brand";
import { AnalysisDashboard } from "@/components/analysis/analysis-tab";
import { SearchBox } from "@/components/layout/search-box";
import { getJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Health, Series } from "@/types/api";

// Data Insights view — its own code-split chunk (keeps its ECharts imports out of the initial bundle).
const RevisionComparison = lazy(() =>
  import("@/components/insights/revision-comparison").then((m) => ({ default: m.RevisionComparison })),
);

const MAX_SELECTED = 4;

type View = "home" | "insights";

// The sidebar is a FEATURES nav rail (Koyfin pattern): Home = the markets overview, Data Insights =
// the vintage/revision studies. Not filters, not a working set — those live elsewhere.
const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "insights", label: "Data Insights", icon: Telescope },
];

// A live indicator that the dashboard can reach the read API — proves the spine end-to-end.
function HealthBadge() {
  const { data, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => getJson<Health>("/health"),
    retry: 1,
    staleTime: 30_000,
  });
  const ok = data?.status === "ok";
  const state = isLoading ? "checking…" : ok ? "connected" : "offline";
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex" title={`API: ${state}`}>
      <span
        className={cn(
          "size-2 rounded-full",
          isLoading && "animate-pulse bg-muted-foreground/40",
          ok && "bg-emerald-500",
          !isLoading && !ok && "bg-destructive",
        )}
      />
      API {state}
    </span>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Series[]>([]);
  const [search, setSearch] = useState("");
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.series_id)), [selected]);

  const toggle = (s: Series) =>
    setSelected((cur) =>
      cur.some((x) => x.series_id === s.series_id)
        ? cur.filter((x) => x.series_id !== s.series_id)
        : cur.length >= MAX_SELECTED
          ? cur
          : [...cur, s],
    );

  const sidebar = (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      {/* brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <DataQuestMark className="size-5 text-foreground" />
        <DataQuestWordmark className="text-base" />
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
    <AppShell
      sidebar={sidebar}
      header={
        <div className="flex flex-1 items-center gap-3">
          <SearchBox value={search} onChange={setSearch} />
          <div className="ml-auto flex items-center gap-3">
            <HealthBadge />
            <ThemeToggle />
          </div>
        </div>
      }
    >
      {view === "home" ? (
        <AnalysisDashboard selected={selected} selectedIds={selectedIds} onToggle={toggle} search={search} />
      ) : (
        <Suspense fallback={<div className="px-6 pt-6 text-sm text-muted-foreground">Loading…</div>}>
          <RevisionComparison />
        </Suspense>
      )}
    </AppShell>
  );
}