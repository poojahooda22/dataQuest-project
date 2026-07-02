import { cn } from "@/lib/utils";

export function DataQuestMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} aria-hidden="true">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
      <path d="M12 12l8-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <path d="M12 12v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <path d="M12 12L4 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="12" cy="3" r="1.5" fill="currentColor" />
      <circle cx="20" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="20" cy="16.5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="21" r="1.5" fill="currentColor" />
      <circle cx="4" cy="16.5" r="1.5" fill="currentColor" />
      <circle cx="4" cy="7.5" r="1.5" fill="currentColor" />
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