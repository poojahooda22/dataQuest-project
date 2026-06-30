import { cn } from "@/lib/utils";

// The per-series commercial-DISPLAY licence verdict — DataQuest's one genuinely unique surface. No free
// incumbent (FRED / ALFRED / OpenBB / DBnomics) renders a per-series commercial-license verdict. We do.
//
// The verdict IS the backend `commercial_ok` gate (never re-derived in the UI): GREEN = cleared for
// commercial display (public-domain / CC-BY / licensed, with attribution rendered); RED = open data that
// is free to VIEW but not cleared for commercial redistribution (a source ToS held pending first-party
// review). The attribution string is shown on hover — required for CC-BY/ECB and good practice always.
export function LicenseChip({ ok, attribution }: { ok: boolean; attribution?: string }) {
  const title = ok
    ? `GREEN — cleared for commercial display.${attribution ? " " + attribution : ""}`
    : `RED — open data, free to view; not cleared for commercial redistribution (source ToS pending review).${
        attribution ? " " + attribution : ""
      }`;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        ok
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      )}
      aria-label={`commercial license: ${ok ? "green, cleared" : "red, restricted"}`}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />
      {ok ? "GREEN" : "RED"}
    </span>
  );
}
