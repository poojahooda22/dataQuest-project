import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";

/** Compact per-series revision-reliability (revisable/regime-A series only). Mirrors the backend's
 * `GET /api/v1/catalog/reliability` shape — the same signal the Data Insights card computes, summarized. */
export interface SeriesReliability {
  status: "ok" | "unavailable";
  mar?: number | null;
  mr?: number | null;
  verdict?: "test" | "estimate_only" | "insufficient" | "no_variation" | null;
  significant?: boolean | null;
  readout?: string | null;
}

export function useReliability() {
  return useQuery({
    queryKey: ["catalog-reliability"],
    queryFn: () =>
      getJson<{ reliability: Record<string, SeriesReliability> }>("/api/v1/catalog/reliability"),
    staleTime: 5 * 60_000, // static between ingests; no need to refetch on every visit
  });
}
