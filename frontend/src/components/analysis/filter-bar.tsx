import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

const FREQ_LABEL: Record<string, string> = { D: "Daily", W: "Weekly", M: "Monthly", Q: "Quarterly", A: "Annual" };

// The "Dashboard Filters" row — the facet dropdowns that narrow the SGRID. Search lives in the
// top bar (header), not here. All facets AND-combine; category/frequency are filter controls,
// never row groups.
export function FilterBar({
  cid,
  onCid,
  source,
  onSource,
  freq,
  onFreq,
  category,
  onCategory,
  cids,
  sources,
  frequencies,
  categories,
  onClear,
}: {
  cid: string | undefined;
  onCid: (v: string | undefined) => void;
  source: string | undefined;
  onSource: (v: string | undefined) => void;
  freq: string | undefined;
  onFreq: (v: string | undefined) => void;
  category: string | undefined;
  onCategory: (v: string | undefined) => void;
  cids: string[];
  sources: string[];
  frequencies: string[];
  categories: string[];
  onClear: () => void;
}) {
  const active = !!(cid || source || freq || category);

  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <Select value={cid ?? ALL} onValueChange={(v) => onCid(v === ALL ? undefined : v)}>
        <SelectTrigger size="sm" className="w-[130px]">
          <SelectValue placeholder="All markets" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All markets</SelectItem>
          {cids.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={category ?? ALL} onValueChange={(v) => onCategory(v === ALL ? undefined : v)}>
        <SelectTrigger size="sm" className="w-[140px]">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={freq ?? ALL} onValueChange={(v) => onFreq(v === ALL ? undefined : v)}>
        <SelectTrigger size="sm" className="w-[150px]">
          <SelectValue placeholder="All frequencies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All frequencies</SelectItem>
          {frequencies.map((f) => (
            <SelectItem key={f} value={f}>
              {FREQ_LABEL[f] ?? f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={source ?? ALL} onValueChange={(v) => onSource(v === ALL ? undefined : v)}>
        <SelectTrigger size="sm" className="w-[130px]">
          <SelectValue placeholder="All sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sources</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active ? (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
