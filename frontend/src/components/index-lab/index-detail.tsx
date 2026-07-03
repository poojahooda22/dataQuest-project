import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { LicenseChip } from "@/components/common/license-chip";
import { PanelError, PanelLoading } from "@/components/common/panel-state";
import { useIndex, useIndexChanges, useIndexComposition } from "@/hooks/use-indices";
import { cn } from "@/lib/utils";

import { ChangesPanel } from "./changes-panel";
import { CompositionTable } from "./composition-table";
import { HowItsBuilt } from "./how-its-built";

type Section = "composition" | "how" | "changes";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "composition", label: "Composition" },
  { id: "how", label: "How it's built" },
  { id: "changes", label: "Changes" },
];

// The index drill: header (title + licence + summary), a section switcher, and the methodology +
// attribution footer — where the CC-BY / source-attribution obligation actually renders on screen.
export function IndexDetail({ indexId, onBack }: { indexId: string; onBack: () => void }) {
  const [section, setSection] = useState<Section>("composition");
  const detail = useIndex(indexId);
  const composition = useIndexComposition(indexId);
  const changes = useIndexChanges(indexId);

  if (detail.isError || composition.isError) return <PanelError />;
  if (detail.isLoading || !detail.data || composition.isLoading || !composition.data) {
    return <PanelLoading label="Loading index…" />;
  }

  const d = detail.data;
  const c = composition.data;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All indices
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{d.title}</h1>
            <LicenseChip ok={d.commercial_ok} attribution={d.attribution} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{d.description}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Rebalance {c.rebalance_date}</div>
          <div>
            {c.n_eligible} eligible · {c.n_excluded} excluded
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              section === s.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "composition" ? (
        <CompositionTable constituents={c.constituents} />
      ) : section === "how" ? (
        <HowItsBuilt rules={d.rules} constituents={c.constituents} />
      ) : changes.isLoading || !changes.data ? (
        <PanelLoading label="Loading changes…" />
      ) : (
        <ChangesPanel changes={changes.data} />
      )}

      <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p>{d.methodology_note}</p>
        <p className="pt-1 font-medium text-foreground/80">
          {d.attribution} · {d.doc_version}
        </p>
      </div>
    </div>
  );
}
