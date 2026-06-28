import { keepPreviousData, useQueries } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { SeriesResponse } from "@/types/api";

/**
 * Fetch several series at once for a compare/relate view — one `/series` call per ticker (each
 * carries the licence gate; the shipped `/observations` does not). Native resolution (no
 * max_points) so transforms run on full data. Returns results positionally aligned to `tickers`.
 */
export function useCompare(tickers: string[], start?: string) {
  return useQueries({
    queries: tickers.map((ticker) => ({
      queryKey: ["series", { ticker, start: start ?? null }],
      queryFn: () =>
        getJson<SeriesResponse>(
          `/api/v1/series/${encodeURIComponent(ticker)}${start ? `?start=${encodeURIComponent(start)}` : ""}`,
        ),
      placeholderData: keepPreviousData,
    })),
  });
}