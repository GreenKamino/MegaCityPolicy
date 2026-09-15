// Calm start — a deliberate grace period for brand-new players.
//
// Day 1 (ticks 1-3) of a new game holds back crises, raids, skirmishes, random
// world events, and alarm alerts so the opening is not a pile of fires to fight.
// 4 ticks = 1 day (see formulas.ts ticksPerDay), so by default Day 2 begins at
// totalTicks === 4 and normal event generation resumes from there.
//
// The window length is per-save: the gate compares totalTicks against
// `state.calmStartTicks` (default CALM_START_TICKS, persisted by a fresh/guided
// game; a Veteran start persists 0 to skip the grace period entirely). Saves
// lacking the field — legacy saves — fall back to CALM_START_TICKS, but they are
// long past it anyway, so they are unaffected. The gate suppresses only discrete
// EVENTS; the core economy/resource/stat simulation keeps running normally
// throughout Day 1.

import type { GameState } from "@/engine/types";

export const CALM_START_TICKS = 4;

// The calm-start window length is per-save. Guided starts (and any save lacking
// the field — legacy or veteran below) fall back to the default CALM_START_TICKS.
// A Veteran start persists a shorter/zero window via `state.calmStartTicks`, so
// crises resume immediately for experienced players. Keying off state (not the
// module constant) lets the new-game start-style choice scale this with no
// per-call branching at every spawner site.
export function negativeEventsAllowed(s: Pick<GameState, "totalTicks" | "calmStartTicks">): boolean {
  const window = typeof s.calmStartTicks === "number" ? s.calmStartTicks : CALM_START_TICKS;
  return s.totalTicks >= window;
}
