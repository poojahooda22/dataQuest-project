import type { RevisionObservation } from "@/types/api";

export interface ConvergencePoint {
  release: number; // 1-based release age (1 = first print, 2 = second estimate, …)
  marPct: number; // mean ABSOLUTE revision vs the latest estimate, as % of the latest, at this release age
  n: number; // observations contributing at this release age
}

const MIN_N = 5; // don't plot a release age backed by too few observations to mean anything

/**
 * Convergence curve: for each release age k, the mean absolute revision (as a % of the latest estimate)
 * still remaining at that release — across every observation that reached release k. It answers "how far
 * is the k-th published estimate from today's number, on average?", so it declines toward 0 as estimates
 * settle. Computed over observations with ≥2 vintages; a release age is dropped below MIN_N observations.
 *
 * Honesty note carried to the UI: the revision INCLUDES benchmark/annual rebasing (a level rebase shows
 * up here as a large revision, not a data error) — it measures distance to the latest published value,
 * not "first-print error vs a fixed truth".
 */
export function convergenceCurve(observations: RevisionObservation[], maxReleases = 12): ConvergencePoint[] {
  const sums = new Array<number>(maxReleases).fill(0);
  const counts = new Array<number>(maxReleases).fill(0);
  for (const obs of observations) {
    const vs = obs.vintages;
    if (vs.length < 2) continue;
    const final = vs[vs.length - 1]!.value;
    if (final === 0) continue;
    const k = Math.min(vs.length, maxReleases);
    for (let i = 0; i < k; i++) {
      sums[i]! += Math.abs((vs[i]!.value - final) / final) * 100;
      counts[i]! += 1;
    }
  }
  const out: ConvergencePoint[] = [];
  for (let i = 0; i < maxReleases; i++) {
    if (counts[i]! >= MIN_N) out.push({ release: i + 1, marPct: sums[i]! / counts[i]!, n: counts[i]! });
  }
  return out;
}

export interface TrackPoint {
  vintage_date: string;
  value: number;
}

/** One observation's value across its successive vintages — the fixed-event revision track. */
export function eventTrack(observations: RevisionObservation[], observationDate: string): TrackPoint[] {
  const obs = observations.find((o) => o.observation_date === observationDate);
  return obs ? obs.vintages.map((v) => ({ vintage_date: v.vintage_date, value: v.value })) : [];
}

/** The most-revised observation (most vintages) — a sensible, interesting default for the track. */
export function mostRevised(observations: RevisionObservation[]): string | undefined {
  let best: RevisionObservation | undefined;
  for (const o of observations) {
    if (!best || o.vintages.length > best.vintages.length) best = o;
  }
  return best?.observation_date;
}
