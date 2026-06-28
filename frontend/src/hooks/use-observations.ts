import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { QdfRecord } from "@/types/api";

/**
 * Bulk-fetch recent observations for MANY series in one call (the shipped /observations endpoint) —
 * used to drive the at-a-glance Overview table. One request for the whole catalog instead of N
 * per-series calls (compute-once). The endpoint declares `tickers: list[str]`, so each ticker is a
 * REPEATED query param (`?tickers=A&tickers=B`), not a comma-joined value. It returns raw rows in
 * the date window (no downsampling), so period-over-period changes are computed on real points.
 *
 * NOTE: /observations carries no licence-gate fields. The Overview sources commercial_ok +
 * attribution from the catalog row instead; the values themselves are real store data.
 */
export function useObservations(tickers: string[], start?: string) {
  const sortedKey = [...tickers].sort();
  return useQuery({
    queryKey: ["observations", { tickers: sortedKey, start: start ?? null }],
    enabled: tickers.length > 0,
    queryFn: () => {
      const p = new URLSearchParams();
      for (const t of tickers) p.append("tickers", t);
      if (start) p.set("start", start);
      return getJson<QdfRecord[]>(`/api/v1/observations?${p.toString()}`);
    },
  });
}