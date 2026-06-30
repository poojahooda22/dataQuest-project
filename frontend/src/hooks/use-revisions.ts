import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { RevisionsResponse } from "@/types/api";

/**
 * Fetch the FULL revision history of a series (every vintage of every observation) — the data source for
 * the convergence curve and the fixed-event revision track. Regime-A (revisable) series only; the
 * endpoint 422s a market series. `start` bounds the observation window (the frontend keeps it recent so
 * the payload stays small).
 */
export function useRevisions(ticker: string | undefined, start?: string) {
  return useQuery({
    queryKey: ["revisions", { ticker: ticker ?? null, start: start ?? null }],
    enabled: !!ticker,
    queryFn: () => {
      const p = new URLSearchParams();
      if (start) p.set("start", start);
      const qs = p.toString();
      return getJson<RevisionsResponse>(
        `/api/v1/series/${encodeURIComponent(ticker!)}/revisions${qs ? `?${qs}` : ""}`,
      );
    },
  });
}
