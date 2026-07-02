import { ArrowLeftRight, Boxes, Flame, Percent, TrendingUp, Users, type LucideIcon } from "lucide-react";

// One glyph + accent color per data-product THEME — the shared visual language that gives each product a
// "face" (reused on the catalog card and, later, the dataset-detail header). Keyed by `DataProduct.theme`.
// An unmapped theme falls back to a neutral generic tile, so a new product never renders blank.
export interface ThemeVisual {
  icon: LucideIcon;
  accent: string; // text color for the glyph
  tint: string; // tinted background for the icon container
}

const THEME_VISUAL: Record<string, ThemeVisual> = {
  Inflation: { icon: Flame, accent: "text-amber-500", tint: "bg-amber-500/10" },
  Labor: { icon: Users, accent: "text-blue-500", tint: "bg-blue-500/10" },
  Growth: { icon: TrendingUp, accent: "text-emerald-500", tint: "bg-emerald-500/10" },
  Rates: { icon: Percent, accent: "text-indigo-500", tint: "bg-indigo-500/10" },
  FX: { icon: ArrowLeftRight, accent: "text-purple-500", tint: "bg-purple-500/10" },
};

export function themeVisual(theme: string): ThemeVisual {
  return THEME_VISUAL[theme] ?? { icon: Boxes, accent: "text-muted-foreground", tint: "bg-muted" };
}
