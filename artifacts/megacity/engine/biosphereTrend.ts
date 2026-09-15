import type { GameState, TickEntry } from "@/engine/types";
import { NATURAL_BIOSPHERE_FLOOR, BIOSPHERE_OUTBREAK_EVENT_IDS } from "@/engine/tickProcessors";

// Above this the biosphere is healthy enough that a returning player needs no
// reassurance — no trend chip is shown.
export const HEALTHY_BIOSPHERE_THRESHOLD = 50;

// Biosphere outbreak events actively erode ecology while active.
const OUTBREAK_EVENT_IDS = new Set<string>(BIOSPHERE_OUTBREAK_EVENT_IDS);

export type BiosphereTrendDirection = "recovering" | "degrading";

export type BiosphereTrend = {
  direction: BiosphereTrendDirection;
  /** Short uppercase chip label, e.g. "RECOVERING". */
  label: string;
  /** One-line plain summary of what is happening right now. */
  headline: string;
  /** Longer explanation, including the green-infrastructure caveat. */
  detail: string;
  /** The low survivable floor natural rewilding recovers toward. */
  floor: number;
};

function countActiveOutbreaks(state: GameState): number {
  const events = Array.isArray(state.activeEvents) ? state.activeEvents : [];
  return events.filter((e) => e && OUTBREAK_EVENT_IDS.has((e as { id?: string }).id ?? "")).length;
}

function biosphereEntries(state: GameState): TickEntry[] {
  const log = Array.isArray(state.tickLog) ? state.tickLog : [];
  return log.filter((e) => e && e.label === "Biosphere");
}

/**
 * Derive whether a low biosphere is recovering (toward the natural floor) or
 * degrading, so the UI can reassure a returning player that neglected nature is
 * on a recovery path rather than permanently dead.
 *
 * The signal blends two sources so it stays stable and truthful:
 *  - State conditions that mirror `processBiosphere`'s natural-rewilding rule
 *    (no active outbreaks and biosphere at/below the floor). Natural rewilding
 *    only nudges the value every 4th tick, so reading the last tick's entries
 *    alone would flicker — the state condition is the stable driver here.
 *  - The Biosphere tick entries themselves for the mid band (between the floor
 *    and healthy), where the applied delta is an accurate up/down signal.
 *
 * Returns null when the biosphere is healthy enough to need no messaging.
 */
export function getBiosphereTrend(state: GameState): BiosphereTrend | null {
  const cs = state.cityStats;
  if (!cs || typeof cs.biosphere !== "number") return null;
  const bio = cs.biosphere;
  if (bio >= HEALTHY_BIOSPHERE_THRESHOLD) return null;

  const floor = NATURAL_BIOSPHERE_FLOOR;
  const outbreaks = countActiveOutbreaks(state);

  // Active outbreaks are eroding the biosphere — clearly degrading.
  if (outbreaks > 0) {
    return {
      direction: "degrading",
      label: "DEGRADING",
      headline: "Active outbreaks are eroding your biosphere.",
      detail:
        "Contain the outbreaks, then add ecological reserves and green tech. Once outbreaks clear, a badly degraded biosphere recovers on its own toward a low floor of " +
        floor +
        " — but reaching a healthy biosphere still needs real green infrastructure.",
      floor,
    };
  }

  // At or below the natural floor with no outbreaks: nature is reclaiming the
  // neglected wildlands back toward — and holding them at — the survivable floor.
  if (bio <= floor) {
    return {
      direction: "recovering",
      label: "RECOVERING",
      headline: "Nature is slowly reclaiming your neglected wildlands.",
      detail:
        "Left alone, an abandoned biosphere isn't doomed — it very slowly rewilds back toward a low survivable floor of " +
        floor +
        ". That floor is all recovery reaches on its own; a healthy biosphere still needs green infrastructure — ecological reserves, remediation domes, and sanctuary policies.",
      floor,
    };
  }

  // Mid band (between the floor and healthy): trust the applied tick deltas. The
  // Biosphere tick entry carries the continuous recovery rate, so a small ongoing
  // investment reads as recovering every tick instead of flickering.
  const entries = biosphereEntries(state);
  const netDelta = entries.reduce((sum, e) => sum + (typeof e.delta === "number" ? e.delta : 0), 0);

  if (netDelta > 0) {
    return {
      direction: "recovering",
      label: "RECOVERING",
      headline: "Your biosphere is climbing back up.",
      detail:
        "It's on the way up. Keep investing in green infrastructure — ecological reserves, remediation domes, and sanctuary policies — to push it all the way back to a healthy biosphere.",
      floor,
    };
  }

  if (netDelta < 0) {
    return {
      direction: "degrading",
      label: "DEGRADING",
      headline: "Pollution and neglect are dragging your biosphere down.",
      detail:
        "Add ecological reserves and green tech before it crashes and triggers plagues. Even fully neglected, it won't fall past a low floor of " +
        floor +
        " — but that floor is far from healthy.",
      floor,
    };
  }

  return null;
}
