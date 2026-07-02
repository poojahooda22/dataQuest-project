import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/api";
import type { DataProductSummary, ProductDetail } from "@/types/api";

/**
 * Browse the Data Products — the catalog grouping level (Catalog -> Data Product -> Dataset). One cached
 * query; server returns the products with a dataset count + a roll-up commercial-display verdict.
 */
export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => getJson<DataProductSummary[]>("/api/v1/products"),
  });
}

/** One Data Product + its datasets. Disabled until a product id is selected. */
export function useProduct(productId: string | null) {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: () => getJson<ProductDetail>(`/api/v1/products/${productId}`),
    enabled: !!productId,
  });
}