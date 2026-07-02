import { useState } from "react";

import { Braces, ExternalLink } from "lucide-react";

import { DatasetDetail } from "@/components/catalog/dataset-detail";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductDetail } from "@/components/catalog/product-detail";
import { RecentChanges } from "@/components/catalog/recent-changes";
import { PanelEmpty, PanelError, PanelLoading } from "@/components/common/panel-state";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { useProducts } from "@/hooks/use-products";
import { BACKEND_URL } from "@/lib/config";
import type { Series } from "@/types/api";

// Data Catalog — the Fusion-style Catalog -> Data Product -> Dataset browse. The PRODUCTS are the star:
// the landing is a grid of product cards; opening one drills into its datasets; opening a dataset shows
// its DETAIL page (overview / preview / dictionary / vintages / access) — the journey never leaves the
// catalog. `selected` + `dataset` are local UI state (the drill), products are server state (TanStack).
export function CatalogTab({
  search = "",
  onOpenInHome,
}: {
  search?: string;
  onOpenInHome: (s: Series) => void;
}) {
  const products = useProducts();
  const [selected, setSelected] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Series | null>(null);

  const needle = search.trim().toLowerCase();
  const visible = (products.data ?? []).filter(
    (p) => !needle || [p.title, p.description, p.theme].some((t) => t?.toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-4 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      {dataset ? (
        <DatasetDetail series={dataset} onBack={() => setDataset(null)} onOpenInHome={onOpenInHome} />
      ) : selected ? (
        <ProductDetail
          productId={selected}
          search={search}
          onBack={() => setSelected(null)}
          onOpenDataset={setDataset}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">Data Catalog</h1>
              <p className="text-sm text-muted-foreground">
                Browse our data products — grouped, normalized series with a per-product commercial-display
                licence verdict. Open a product to see its datasets.
              </p>
            </div>
            <a
              href={`${BACKEND_URL}/api/v1/catalog.jsonld`}
              target="_blank"
              rel="noopener noreferrer"
              title="View the whole catalog as machine-readable DCAT-v3 JSON-LD"
              className="shrink-0"
            >
              <Badge
                variant="pill"
                color="gray"
                size="sm"
                icon={<Braces className="size-3" />}
                trailingIcon={<ExternalLink className="size-3" />}
                className="cursor-pointer opacity-70 transition-opacity hover:opacity-100"
              >
                Developers · DCAT
              </Badge>
            </a>
          </div>

          {products.isError ? (
            <PanelError />
          ) : products.isLoading && !products.data ? (
            <PanelLoading label="Loading products…" />
          ) : visible.length === 0 ? (
            <PanelEmpty
              title={needle ? "No matches" : "No products"}
              message={needle ? "No data products match the search." : "The catalog has no data products yet."}
            />
          ) : (
            <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => (
                <StaggerItem key={p.product_id} className="h-full">
                  <ProductCard product={p} onOpen={setSelected} />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {!needle ? <RecentChanges onOpenDataset={setDataset} /> : null}
        </>
      )}
    </div>
  );
}