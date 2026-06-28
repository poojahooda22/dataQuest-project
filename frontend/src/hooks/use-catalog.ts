import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { Series } from "@/types/api";

export interface CatalogFilters {
  cid?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

function toQuery(f: CatalogFilters): string {
  const p = new URLSearchParams();
  if (f.cid) p.set("cid", f.cid);
  if (f.source) p.set("source", f.source);
  p.set("limit", String(f.limit ?? 200));
  p.set("offset", String(f.offset ?? 0));
  return `?${p.toString()}`;
}

/**
 * Browse the catalog. Filters by `cid` + `source` SERVER-SIDE (the shipped /catalog params).
 * Free-text search (`q`) is a to-build backend prerequisite; until then a text filter runs
 * client-side over the loaded page (see series-browser). Returns the bare `Series[]` list.
 */
export function useCatalog(filters: CatalogFilters = {}) {
  return useQuery({
    queryKey: ["catalog", filters],
    queryFn: () => getJson<Series[]>(`/api/v1/catalog${toQuery(filters)}`),
  });
}