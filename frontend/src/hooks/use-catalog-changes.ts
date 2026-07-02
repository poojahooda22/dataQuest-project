import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { CatalogChangesResponse } from "@/types/api";

/** What the sources published recently (default: the API's 30-day window), newest first. */
export function useCatalogChanges(limit = 8) {
  return useQuery({
    queryKey: ["catalog-changes", limit],
    queryFn: () => getJson<CatalogChangesResponse>(`/api/v1/catalog/changes?limit=${limit}`),
  });
}
