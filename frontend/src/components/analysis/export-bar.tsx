import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Point } from "@/lib/transforms";

// CSV export of the currently-shown (transformed) series. PNG export is the chart's own toolbox
// button (top-right of the chart) — no instance plumbing needed.
export function ExportBar({ rows, filename }: { rows: Point[]; filename: string }) {
  const downloadCsv = () => {
    const header = "observation_date,value\n";
    const body = rows.map((r) => `${r.date},${r.value}`).join("\n");
    const blob = new Blob([header + body + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
      <Download />
      CSV
    </Button>
  );
}