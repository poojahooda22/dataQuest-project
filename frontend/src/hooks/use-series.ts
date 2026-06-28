import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { SeriesResponse } from "@/types/api";

export interface SeriesParams {
  ticker: string | null;
  asOf?: string;
  start?: string;
  end?: string;
  /**
   * Server-side LTTB cap. Pass ONLY for a raw-level view of a huge series; for any transformed
   * view fetch native resolution (omit this) so the transform runs on the full series, then let
   * the chart sample for display (the R70 transform-order rule).
   */
  maxPoints?: number;
}

function toQuery(p: SeriesParams): string {
  const q = new URLSearchParams();
  if (p.asOf) q.set("as_of", p.asOf);
  if (p.start) q.set("start", p.start);
  if (p.end) q.set("end", p.end);
  if (p.maxPoints) q.set("max_points", String(p.maxPoints));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * GET /series/{ticker} — the point-in-time series as known on `as_of`. `placeholderData:
 * keepPreviousData` keeps the previous series on screen during a range switch (no loading flash).
 * Caveat (v5): on a background-refetch error the query stays in `success` showing the previous
 * data — consumers that must not show stale-as-fresh should read `isPlaceholderData` + `isError`.
 */
export function useSeries(p: SeriesParams) {
  return useQuery({
    queryKey: ["series", p],
    queryFn: () => getJson<SeriesResponse>(`/api/v1/series/${encodeURIComponent(p.ticker ?? "")}${toQuery(p)}`),
    enabled: p.ticker != null,
    placeholderData: keepPreviousData,
  });
}