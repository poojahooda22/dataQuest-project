import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { ChangesResponse, CompositionResponse, IndexDetail, IndexSummary } from "@/types/api";

/** The Index Lab list — every index with its latest-composition summary + licence verdict. */
export function useIndices() {
  return useQuery({
    queryKey: ["indices"],
    queryFn: () => getJson<IndexSummary[]>("/api/v1/indices"),
  });
}

/** One index's rules-as-data + summary. Disabled until an index is selected. */
export function useIndex(indexId: string | null) {
  return useQuery({
    queryKey: ["index", indexId],
    queryFn: () => getJson<IndexDetail>(`/api/v1/indices/${indexId}`),
    enabled: !!indexId,
  });
}

/** The point-in-time composition. `asOf` / `rebalance` (ISO dates) pin the vintage / the month. */
export function useIndexComposition(
  indexId: string | null,
  opts?: { asOf?: string; rebalance?: string },
) {
  const params = new URLSearchParams();
  if (opts?.asOf) params.set("as_of", opts.asOf);
  if (opts?.rebalance) params.set("rebalance", opts.rebalance);
  const qs = params.toString();
  return useQuery({
    queryKey: ["index-composition", indexId, opts?.asOf ?? null, opts?.rebalance ?? null],
    queryFn: () =>
      getJson<CompositionResponse>(`/api/v1/indices/${indexId}/composition${qs ? `?${qs}` : ""}`),
    enabled: !!indexId,
  });
}

/** What changed between the two most recent rebalances. Empty until an index has two. */
export function useIndexChanges(indexId: string | null) {
  return useQuery({
    queryKey: ["index-changes", indexId],
    queryFn: () => getJson<ChangesResponse>(`/api/v1/indices/${indexId}/changes`),
    enabled: !!indexId,
  });
}
