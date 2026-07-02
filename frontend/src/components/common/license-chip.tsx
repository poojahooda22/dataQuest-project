import { cn } from "@/lib/utils";

// The per-series commercial-DISPLAY licence verdict, rendered straight from the backend `commercial_ok`
// gate (never re-derived in the UI). A per-series usage label is not itself unique — FRED publishes a
// per-series copyright/usage label too; the distinguishing verdict is the fetch-path split (a source can
// be display-GREEN yet file-redistribution-RED), which is what a downstream redistributor actually needs.
//
// GREEN = cleared for commercial display (public-domain / CC-BY / licensed, with attribution rendered);
// RED = the DISPLAY axis is restricted — research/personal display only (e.g. an all-rights-reserved
// source with no reuse grant). File REDISTRIBUTION is the separate `downloadable` gate, not this chip.
// The attribution string is shown on hover — required for CC-BY/ECB, good practice always.
export function LicenseChip({ ok, attribution }: { ok: boolean; attribution?: string }) {
  const title = ok
    ? `GREEN — cleared for commercial display.${attribution ? " " + attribution : ""}`
    : `RED — research/personal display only; the source licence does not clear commercial display.${
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
