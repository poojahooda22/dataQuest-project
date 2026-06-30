import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { RevisionStatsResponse } from "@/types/api";

/**
 * Fetch the server-computed revision diagnostics (MR/MAR/RMSR, persistence, the sample-AND-persistence-
 * gated bias test, and the plain-language reliability readout). All math is server-side; the card only
 * renders what this returns. Regime-A series only (the endpoint 422s a market series).
 */
export function useRevisionStats(ticker: string | undefined, start?: string) {
  return useQuery({
    queryKey: ["revision-stats", { ticker: ticker ?? null, start: start ?? null }],
    enabled: !!ticker,
    queryFn: () => {
      const p = new URLSearchParams();
      if (start) p.set("start", start);
      const qs = p.toString();
      return getJson<RevisionStatsResponse>(
        `/api/v1/series/${encodeURIComponent(ticker!)}/revision-stats${qs ? `?${qs}` : ""}`,
      );
    },
  });
}
