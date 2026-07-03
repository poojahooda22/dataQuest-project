import { useState } from "react";

import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { useIndices } from "@/hooks/use-indices";

import { IndexCard } from "./index-card";
import { IndexDetail } from "./index-detail";

// Index Lab — the tab. Landing is a grid of index cards; opening one drills into its composition,
// "how it's built", and changes. Mirrors the Data Catalog tab's list -> detail journey.
export function IndexLabTab({ search = "" }: { search?: string }) {
  const indices = useIndices();
  const [selected, setSelected] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const visible = (indices.data ?? []).filter(
    (i) =>
      !needle ||
      [i.title, i.description, i.family, i.universe].some((t) => t?.toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-4 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      {selected ? (
        <IndexDetail indexId={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div>
            <h1 className="text-lg font-semibold">Index Lab</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Build a bond index in the open — the same published rules the big benchmarks use, with every
              eligibility decision and weight shown. Each index is point-in-time: its composition is stored
              as a vintage, so you can see it as it was known on any date.
            </p>
          </div>

          {indices.isError ? (
            <PanelError />
          ) : indices.isLoading && !indices.data ? (
            <PanelLoading label="Loading indices…" />
          ) : visible.length === 0 ? (
            <PanelEmpty
              title={needle ? "No matches" : "No indices"}
              message={needle ? "No indices match the search." : "No indices have been built yet."}
            />
          ) : (
            <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((i) => (
                <StaggerItem key={i.index_id} className="h-full">
                  <IndexCard index={i} onOpen={setSelected} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}
    </div>
  );
}
