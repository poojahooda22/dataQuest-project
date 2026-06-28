import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { PanelResponse } from "@/types/api";

/**
 * Fetch a vintage comparison (diff-two-vintages) for a vintage-capable series:
 * the series as known on `vintageA` vs `vintageB` (default today), with the revision computed
 * server-side. Disabled until a ticker + vintageA are set; keeps the prior result on a date change.
 */
export function usePanel(ticker: string | undefined, vintageA: string, vintageB?: string) {
  return useQuery({
    queryKey: ["panel", { ticker, vintageA, vintageB: vintageB ?? null }],
    enabled: !!ticker && !!vintageA,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({ vintage_a: vintageA });
      if (vintageB) params.set("vintage_b", vintageB);
      return getJson<PanelResponse>(`/api/v1/series/${encodeURIComponent(ticker as string)}/panel?${params.toString()}`);
    },
  });
}