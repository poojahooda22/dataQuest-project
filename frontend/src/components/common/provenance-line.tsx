import { cn } from "@/lib/utils";

// The source attribution shown under every chart — the credit the data source requires, rendered
// at display time (the commercial-ok-gate's attribution requirement). Plain language on purpose:
// it answers "where does this data come from?" — no licence jargon for the reader.
export function ProvenanceLine({ attribution, className }: { attribution: string; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>{attribution || "Source unattributed"}</p>
  );
}