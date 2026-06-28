import { cn } from "@/lib/utils";

// The DataQuest mark: nested arcs = successive information-states ("vintages") of a series —
// the point-in-time motif. Drawn with currentColor so it inherits text color and themes.
export function DataQuestMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-5", className)} aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <path d="M6 12a6 6 0 0 1 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M8 12a4 4 0 0 1 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function DataQuestWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight text-foreground", className)}>
      Data<span className="text-muted-foreground">Quest</span>
    </span>
  );
}