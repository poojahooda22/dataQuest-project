// A tiny inline-SVG trend line for a table row. Deliberately NOT ECharts: a screener renders dozens of
// these at once, and spinning up an ECharts instance per row would be wasteful — a single <polyline>
// over a normalized viewBox draws the recent shape for almost nothing. Colour encodes net direction
// over the window (rise = emerald, fall = red); the line is the magnitude/shape.
export function Sparkline({
  values,
  width = 72,
  height = 22,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-muted-foreground">—</span>;

  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 2; // keep the stroke off the top/bottom edge
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + (height - 2 * pad) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = values[0]!;
  const last = values[values.length - 1]!;
  const stroke = last >= first ? "rgb(16, 185, 129)" : "rgb(239, 68, 68)"; // emerald-500 / red-500

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label="recent trend"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
