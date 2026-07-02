import { LicenseChip } from "@/components/common/license-chip";
import { themeVisual } from "@/lib/theme-visual";
import { cn } from "@/lib/utils";
import type { DataProductSummary } from "@/types/api";

// One DATA PRODUCT as a catalog TILE — the Fusion "Data Product" card, given a face: a theme glyph in an
// accent-tinted well (top-left) + the roll-up commercial-display verdict (top-right, R70: licence lives at
// the product level, not per dataset row) + title + description + a prominent dataset count + an Open
// affordance. Clicking drills into the product's datasets.
export function ProductCard({
  product,
  onOpen,
}: {
  product: DataProductSummary;
  onOpen: (id: string) => void;
}) {
  const tv = themeVisual(product.theme);
  const Icon = tv.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(product.product_id)}
      className={cn(
        "group flex h-full flex-col rounded-xl border border-border bg-card p-5 text-left shadow-sm",
        "transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex size-11 items-center justify-center rounded-lg", tv.tint)}>
          <Icon className={cn("size-5", tv.accent)} strokeWidth={1.75} />
        </div>
        <LicenseChip ok={product.commercial_ok} />
      </div>

      <h3 className="mt-4 text-base font-semibold text-foreground">{product.title}</h3>
      {product.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
      ) : null}

      <div className="mt-auto flex items-center pt-4 text-sm">
        <span className="font-semibold tabular-nums text-foreground">{product.dataset_count}</span>
        <span className="ml-1 text-muted-foreground">
          dataset{product.dataset_count === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}
