import type {
  BarSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
  HeatmapSeriesOption,
} from "echarts/charts";
import type {
  GridComponentOption,
  TooltipComponentOption,
  LegendComponentOption,
  DataZoomComponentOption,
  TitleComponentOption,
  ToolboxComponentOption,
  AriaComponentOption,
  VisualMapComponentOption,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";

// A strict option type composed from exactly the registered modules, so a non-existent or
// unregistered key fails at compile time rather than silently no-op'ing at runtime.
// (markLine / markPoint are series-level fields, enabled by registering their components.)
export type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | HeatmapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | TitleComponentOption
  | ToolboxComponentOption
  | AriaComponentOption
  | VisualMapComponentOption
>;