import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { Series } from "@/types/api";

/** One series' catalog row — GET /catalog/{ticker}. Disabled until a ticker is selected. */
export function useSeriesMeta(ticker: string | null) {
  return useQuery({
    queryKey: ["series-meta", ticker],
    queryFn: () => getJson<Series>(`/api/v1/catalog/${encodeURIComponent(ticker ?? "")}`),
    enabled: ticker != null,
  });
}