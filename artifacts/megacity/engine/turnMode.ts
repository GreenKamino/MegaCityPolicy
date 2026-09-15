// Turn-based play mode.
//
// In turn-based mode the real-time tick loop is switched off (see GameContext's
// scheduling effect + the runOfflineCatchup guard). The simulation only moves
// when the player presses End Turn, which runs `advanceTurn`: it steps the live
// pipeline forward until the next in-game day boundary (one turn == one day),
// but stops the instant a NEW crisis appears so the player must intervene.
//
// This module is node-safe (pure data, no React/audio) so it can be unit
// tested directly and reused by GameContext.endTurn().

import type { GameState, GameEvent, GameMessage, GameDate, TickEntry } from "@/engine/types";
import { isDayStart } from "@/engine/clock";
import { runLiveTick, type LiveTickResult } from "@/engine/liveTickPipeline";
import type { TickSubsystemError } from "@/engine/formulas";

// One in-game day. clock.advanceHour adds 6h per tick, so 4 ticks == 24h. Also
// acts as a hard safety cap on a single End Turn so a malformed clock can never
// spin advanceTurn forever.
export const TICKS_PER_TURN = 4;

// A crisis worth stopping the world for: an unresolved active event at high or
// critical severity. Covers biosphere collapses, intrigue coups/terror/
// assassinations and critical resource/riot events — all built at high|critical
// severity by the tick processors and the event generator.
export function getBlockingCrises(state: GameState): GameEvent[] {
  return (state.activeEvents ?? []).filter(
    (e) => e.resolved !== true && (e.severity === "high" || e.severity === "critical"),
  );
}

export function hasBlockingCrisis(state: GameState): boolean {
  return getBlockingCrises(state).length > 0;
}

// True when the player is allowed to press End Turn: turn-based mode and no
// unresolved crisis currently demanding a decision.
export function canAdvanceTurn(state: GameState): boolean {
  return state.gameplayMode === "turnbased" && !hasBlockingCrisis(state);
}

export type TurnResult = {
  // State after the turn (or after the interrupting crisis appeared).
  state: GameState;
  // How many ticks actually ran this turn (< TICKS_PER_TURN if interrupted or
  // resuming a partially-advanced day).
  ticksAdvanced: number;
  // In-game date the turn ended on.
  toDate: GameDate;
  // Random events that fired during the turn.
  firedEvents: GameEvent[];
  // Inbox messages generated during the turn.
  inboxMessages: GameMessage[];
  // Resource ledger entries across the whole turn (for a detailed recap).
  entries: TickEntry[];
  // Achievements unlocked during the turn (already folded into state).
  newAchievements: string[];
  // The new crisis that cut the turn short, if any.
  interruptedBy: GameEvent | null;
  // Subsystem failures (safeSub catches) collected across EVERY tick this turn,
  // deduped by subsystem+message. getLastTickErrors() resets on every runTick()
  // and each LiveTickResult only carries its own tick's errors, so without this
  // aggregation a subsystem failing mid-turn would be silently swallowed in
  // turn-based mode. Empty when the turn ran clean.
  tickErrors: TickSubsystemError[];
};

// Advance the simulation by one turn. Steps the live pipeline until the clock
// reaches the next day boundary (hour 0), capped at `maxTicks`, stopping early
// the moment a crisis that was NOT already present at the start of the turn
// appears. `tickFn` is injectable purely so tests can drive the loop
// deterministically; production always uses the real runLiveTick.
export function advanceTurn(
  state: GameState,
  tickFn: (s: GameState) => LiveTickResult = runLiveTick,
  maxTicks: number = TICKS_PER_TURN,
): TurnResult {
  // Crises already on the board at the start of the turn must NOT count as the
  // interrupting crisis (End Turn is blocked while any exist, so in practice
  // this set is empty — kept as belt-and-braces).
  const startCrisisIds = new Set(getBlockingCrises(state).map((e) => e.id));

  let s = state;
  let ticksAdvanced = 0;
  const firedEvents: GameEvent[] = [];
  const inboxMessages: GameMessage[] = [];
  const entries: TickEntry[] = [];
  const newAchievements: string[] = [];
  let interruptedBy: GameEvent | null = null;
  // Deduped by subsystem+message so a subsystem that throws the SAME error on
  // every tick of the turn collapses to one row (mirrors processMissedTicks).
  const tickErrorMap = new Map<string, TickSubsystemError>();

  for (let i = 0; i < maxTicks; i++) {
    const r = tickFn(s);
    s = r.state;
    ticksAdvanced++;
    if (r.firedEvent) firedEvents.push(r.firedEvent);
    if (r.inboxMessages.length > 0) inboxMessages.push(...r.inboxMessages);
    if (r.entries.length > 0) entries.push(...r.entries);
    if (r.newAchievements.length > 0) newAchievements.push(...r.newAchievements);
    for (const err of r.tickErrors) {
      const key = `${err.subsystem}::${err.error}`;
      if (!tickErrorMap.has(key)) tickErrorMap.set(key, err);
    }

    const newCrisis = getBlockingCrises(s).find((e) => !startCrisisIds.has(e.id));
    if (newCrisis) {
      interruptedBy = newCrisis;
      break;
    }

    // Turn ends when the clock rolls onto a fresh day. A turn interrupted by a
    // crisis leaves the clock mid-day; the next End Turn finishes that day.
    if (isDayStart(s.gameDate)) break;
  }

  // Re-anchor the wall-clock so a later real-time/offline path (e.g. if a save
  // is ever migrated) never reclaims the frozen span as "missed" ticks.
  s = { ...s, lastTickTime: Date.now() };

  return {
    state: s,
    ticksAdvanced,
    toDate: s.gameDate,
    firedEvents,
    inboxMessages,
    entries,
    newAchievements,
    interruptedBy,
    tickErrors: Array.from(tickErrorMap.values()),
  };
}
