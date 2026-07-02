import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { DatasetAttributesResponse } from "@/types/api";

/** The data dictionary for one dataset — the fields of its point-in-time observation record. */
export function useDatasetAttributes(ticker: string | undefined) {
  return useQuery({
    queryKey: ["dataset-attributes", ticker ?? null],
    enabled: !!ticker,
    queryFn: () =>
      getJson<DatasetAttributesResponse>(`/api/v1/datasets/${encodeURIComponent(ticker!)}/attributes`),
  });
}
