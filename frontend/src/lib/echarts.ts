// The single ECharts registration surface — tree-shaken: only the modules the dashboard draws
// are bundled (the full barrel is ~520KB gzip; this set is far smaller). It is lazy-loaded as a
// chunk (see analysis components), so it never weighs on the initial route.
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  ToolboxComponent,
  AriaComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  ToolboxComponent,
  AriaComponent,
  MarkLineComponent,
  MarkPointComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
]);

export { echarts };
