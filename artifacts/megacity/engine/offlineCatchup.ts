// Pure offline catch-up helper.
//
// Encapsulates the full catchup pipeline that GameContext runs in three
// places (loadSlot, init, and the AppState background→foreground resume):
//   calculateMissedTicks
//     → OFFLINE_SIM_DEPTH_BATCH_LIMIT lookup
//     → processMissedTicks
//     → Math.min/Math.max simulated/extrapolated split
//     → aggregateTickEntries
//     → OfflineReport-shaped payload + post-tick events / mega projects /
//       missions / inbox messages / achievements applied to the new state
//
// Keeping this in one place means a formula change (e.g. a new post-tick
// step, a different batch-limit lookup, or a tweak to the
// simulated/extrapolated split) only needs to land here — the GameContext
// callers and the end-to-end test all delegate.
//
// This module deliberately avoids importing React / React Native / AsyncStorage
// so it stays consumable from a node-only vitest environment.
import {
  applyEventEffects,
  generateRandomEvent,
  resetEndedWarEventOccurrences,
} from "@/engine/events";
import { checkAchievements } from "@/engine/achievements";
import { calculateMissedTicks, computeHousingCapacity, processMissedTicks, type TickSubsystemError } from "@/engine/formulas";
import {
  generateMegaProjectMessage,
  processMegaProjectTick,
} from "@/engine/megaProjects";
import {
  generateMissionMessage,
  processOfficerMissionTick,
} from "@/engine/officerMissions";
import {
  OFFLINE_SIM_DEPTH_BATCH_LIMIT,
  type OfflineSimDepth,
} from "@/engine/offlineSimDepth";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import { getEstimatedMsPerTick, recordTickDuration } from "@/engine/tickPerf";
import { isEarlyGame } from "@/engine/tutorial";
import type {
  GameMessage,
  GameState,
  ResumeOvershootRecord,
  ResumeSampleRecord,
  TickEntry,
} from "@/engine/types";
import {
  isResumeOvershoot,
  RESUME_OVERSHOOT_HISTORY_CAP,
  RESUME_OVERSHOOT_TICK_TTL,
  RESUME_SAMPLE_HISTORY_CAP,
  shouldShowCatchupPill,
} from "@/utils/format";

export type OfflineReport = {
  ticksProcessed: number;
  simulatedTicks: number;
  extrapolatedTicks: number;
  summaryEntries: TickEntry[];
  offlineSimDepth: OfflineSimDepth;
  // Total wall-clock cost of the catch-up batch (processMissedTicks only)
  // measured with performance.now(). Used by TickReportModal to show players
  // how long their resume actually took on this device, so they can compare
  // it against the OFFLINE SIM DEPTH estimate label.
  catchupWallMs: number;
  // Predicted wall-clock cost of the catch-up batch, computed at the start
  // of the resume from the rolling per-tick average × ticks-to-simulate.
  // Captured before processMissedTicks runs so this batch's own samples
  // don't pollute the estimate. TickReportModal compares this against
  // catchupWallMs and warns when reality blew past the estimate.
  estimatedWallMs: number;
  // Subsystem failures (safeSub catches) aggregated across EVERY simulated
  // tick in the catch-up batch, deduped by subsystem+message. Empty when the
  // batch ran clean. Surfaced in the TickReportModal so failures that happen
  // mid-batch aren't swallowed (only the final tick's errors survive in the
  // engine's module-global buffer, and live-tick wiring never reads it here).
  subsystemErrors: TickSubsystemError[];
  // Capped, deduped SAMPLE of subsystem errors that were suppressed from the
  // bounded on-screen list (e.g. a subsystem failing with an ever-changing
  // message). Never rendered; surfaced only in the "Copy report" export so a
  // bug report can carry the most useful diagnostic signal. Empty when nothing
  // was suppressed.
  suppressedErrors: TickSubsystemError[];
  // Total count of suppressed error occurrences (mirrors the "+N more
  // suppressed" overflow summary). May exceed suppressedErrors.length, which is
  // a deduped, capped sample.
  suppressedErrorCount: number;
};

export type OfflineCatchupResult = {
  newState: GameState;
  // Null when there were no missed ticks — the new state still has any
  // freshly-unlocked achievements applied, but nothing to show in the
  // tick-report modal.
  report: OfflineReport | null;
};

// Combine multiple per-tick TickEntry arrays into a single summary, summing
// deltas by label and escalating severity (negative > warning > positive).
// Entries that net to zero are dropped so the modal doesn't list no-op rows.
export function aggregateTickEntries(allEntries: TickEntry[][]): TickEntry[] {
  const map = new Map<string, TickEntry>();
  for (const tickEntries of allEntries) {
    for (const entry of tickEntries) {
      const key = entry.label;
      const existing = map.get(key);
      if (existing) {
        existing.delta += entry.delta;
        if (entry.severity === "negative" || existing.severity === "negative") existing.severity = "negative";
        else if (entry.severity === "warning" || existing.severity === "warning") existing.severity = "warning";
        else if (entry.severity === "positive") existing.severity = "positive";
      } else {
        map.set(key, { ...entry });
      }
    }
  }
  return Array.from(map.values()).filter((e) => e.delta !== 0);
}

// ── CENSUS REPAIR ────────────────────────────────────────────────────────
// One-time load repair for saves hit by the ratcheting-edict population bug
// (base growth rate climbed every tick a growth edict was active, so an
// overnight offline catch-up compounded 5M citizens into the 100B ceiling
// and drained every consumable). A population this far beyond what the
// city's housing could EVER shelter is corrupt data, not overcrowding —
// the housing overshoot penalty (max −0.006/tick) can never walk it back.
// Repairs to 2× housing capacity (a stressed-but-recoverable overcrowding
// level) and tells the player via a one-time inbox message. Merely
// overcrowded cities (2–3× capacity) are far below the 100× trigger and
// are never touched.
const CENSUS_REPAIR_CAPACITY_MULTIPLE = 100;
const CENSUS_REPAIR_MIN_POPULATION = 10_000_000;

export function repairAbsurdPopulation(saved: GameState): GameState {
  const pop = saved.cityStats?.population ?? 0;
  if (!Number.isFinite(pop) || pop < CENSUS_REPAIR_MIN_POPULATION) return saved;
  const housingCap = Math.max(1, computeHousingCapacity(saved.buildings ?? {}));
  if (pop <= housingCap * CENSUS_REPAIR_CAPACITY_MULTIPLE) return saved;

  const repairedPop = Math.max(1000, Math.round(housingCap * 2));
  const msg: GameMessage = {
    id: `census_correction_${saved.totalTicks}`,
    timestamp: saved.gameDate,
    tick: saved.totalTicks,
    category: "report",
    title: "CENSUS CORRECTION",
    body:
      "The Bureau of Records has voided a corrupted census. Phantom registrations inflated the population count far beyond anything the sector's housing could shelter. The registry has been rebuilt from verified habitation records; rations and utilities are being re-planned around the corrected figure.",
    read: false,
    priority: "high",
  };
  return {
    ...saved,
    cityStats: { ...saved.cityStats, population: repairedPop },
    messages: [msg, ...(saved.messages ?? [])].slice(0, ARRAY_CAPS.messages),
  };
}

// Run the offline catch-up pipeline for `saved` at the given offline-sim
// depth. `batchLimit` defaults to OFFLINE_SIM_DEPTH_BATCH_LIMIT[depth] and
// is exposed so tests can dial it down to force the extrapolation branch
// without needing thousands of simulated ticks.
export function runOfflineCatchup(
  savedInput: GameState,
  depth: OfflineSimDepth,
  batchLimit: number = OFFLINE_SIM_DEPTH_BATCH_LIMIT[depth],
): OfflineCatchupResult {
  // Repair corrupt populations BEFORE simulating missed ticks (and before
  // the paused/turn-based early returns) so every load path — slot load,
  // app init, background→foreground resume — passes through the census
  // repair exactly once. Running it first also means the catch-up batch
  // below simulates the CORRECTED city instead of compounding the corrupt
  // one further.
  const saved = repairAbsurdPopulation(savedInput);
  // A paused game must accrue NO offline progress. While paused the live
  // tick loop is stopped, so `lastTickTime` stops advancing and goes stale.
  // Every catch-up entry point (slot load, app init, background→foreground
  // resume) would otherwise see that stale anchor and award a burst of
  // resources, messages and events for the exact span the player chose to
  // pause through. Skip the whole pipeline and re-anchor `lastTickTime` to
  // now so the paused span can never be reclaimed on a later resume.
  if (saved.tickPaused) {
    const newAch = checkAchievements(saved);
    const base = newAch.length > 0
      ? { ...saved, unlockedAchievements: [...(saved.unlockedAchievements ?? []), ...newAch] }
      : saved;
    return { newState: { ...base, lastTickTime: Date.now() }, report: null };
  }

  // Turn-based games never accrue offline progress either. The real-time loop
  // is off entirely (progress only happens on End Turn), so any wall-clock gap
  // is NOT "missed" ticks to reclaim. Mirror the paused-game handling: check
  // achievements, re-anchor lastTickTime, report nothing.
  if (saved.gameplayMode === "turnbased") {
    const newAch = checkAchievements(saved);
    const base = newAch.length > 0
      ? { ...saved, unlockedAchievements: [...(saved.unlockedAchievements ?? []), ...newAch] }
      : saved;
    return { newState: { ...base, lastTickTime: Date.now() }, report: null };
  }

  const missed = calculateMissedTicks(saved.lastTickTime, saved.tickIntervalMinutes ?? 15);
  if (missed <= 0) {
    const newAch = checkAchievements(saved);
    const finalState = newAch.length > 0
      ? { ...saved, unlockedAchievements: [...(saved.unlockedAchievements ?? []), ...newAch] }
      : saved;
    return { newState: finalState, report: null };
  }

  const ticksRun = Math.min(missed, batchLimit);
  // Snapshot the per-tick estimate *before* the catchup so that this
  // batch's own samples don't retroactively change what we predicted.
  const estimatedWallMs = ticksRun * getEstimatedMsPerTick();
  const catchupStart = performance.now();
  const { newState, allEntries, tickErrors, suppressedErrors, suppressedCount } = processMissedTicks(saved, missed, batchLimit);
  const catchupWallMs = performance.now() - catchupStart;
  if (ticksRun > 0) recordTickDuration(catchupWallMs / ticksRun);

  const stateAfterWarCleanup = resetEndedWarEventOccurrences(newState);
  const earlyGame = isEarlyGame(stateAfterWarCleanup);
  const evtResult = earlyGame ? null : generateRandomEvent(stateAfterWarCleanup);
  let afterEvent = evtResult
    ? applyEventEffects(stateAfterWarCleanup, evtResult.event)
    : stateAfterWarCleanup;
  if (evtResult?.cooldowns) afterEvent = { ...afterEvent, eventTriggerCooldowns: evtResult.cooldowns };
  if (evtResult?.eventRecurrenceCounts) {
    afterEvent = { ...afterEvent, eventRecurrenceCounts: evtResult.eventRecurrenceCounts };
  }
  if (evtResult?.warEventOccurrences) {
    afterEvent = { ...afterEvent, warEventOccurrences: evtResult.warEventOccurrences };
  }

  const megaResult = processMegaProjectTick(afterEvent);
  afterEvent = megaResult.state;
  const missionResult = processOfficerMissionTick(afterEvent);
  afterEvent = missionResult.state;

  const inboxMsgs: GameMessage[] = [];
  for (const pid of megaResult.planningComplete) {
    inboxMsgs.push(generateMegaProjectMessage(pid, "planning_complete", afterEvent.gameDate, afterEvent.totalTicks, afterEvent));
  }
  for (const pid of megaResult.completed) {
    inboxMsgs.push(generateMegaProjectMessage(pid, "construction_complete", afterEvent.gameDate, afterEvent.totalTicks, afterEvent));
  }
  for (const pid of megaResult.newlyEligible) {
    inboxMsgs.push(generateMegaProjectMessage(pid, "newly_available", afterEvent.gameDate, afterEvent.totalTicks, afterEvent));
  }
  for (const mr of missionResult.results) {
    const message = generateMissionMessage(mr, afterEvent.gameDate, afterEvent.totalTicks);
    if (
      !afterEvent.dismissedMessageIds?.includes(message.id) &&
      !(afterEvent.messages ?? []).some((existing) => existing.id === message.id) &&
      !inboxMsgs.some((existing) => existing.id === message.id)
    ) {
      inboxMsgs.push(message);
    }
  }
  if (inboxMsgs.length > 0) {
    afterEvent = { ...afterEvent, messages: [...inboxMsgs, ...afterEvent.messages].slice(0, ARRAY_CAPS.messages) };
  }

  const newAch = checkAchievements(afterEvent);
  let finalState = newAch.length > 0
    ? { ...afterEvent, unlockedAchievements: [...(afterEvent.unlockedAchievements ?? []), ...newAch] }
    : afterEvent;

  // Pin overshoots into a small ring buffer so subsequent resumes can
  // escalate the warning ("took longer than expected (3× recently) —
  // consider lowering OFFLINE SIM DEPTH"). Only push when both the
  // ratio and absolute gap thresholds say it's a real overshoot, so
  // routine variance doesn't pollute the history. Drop entries older
  // than RESUME_OVERSHOOT_TICK_TTL game ticks before pushing so the
  // escalation reflects RECENT device perf rather than play sessions
  // from weeks ago.
  if (isResumeOvershoot(catchupWallMs, estimatedWallMs)) {
    const cutoff = finalState.totalTicks - RESUME_OVERSHOOT_TICK_TTL;
    const prior = (finalState.recentResumeOvershoots ?? []).filter(
      (r) => r.atTick >= cutoff,
    );
    const next: ResumeOvershootRecord = {
      actualMs: catchupWallMs,
      estimatedMs: estimatedWallMs,
      atTick: finalState.totalTicks,
    };
    finalState = {
      ...finalState,
      recentResumeOvershoots: [...prior, next].slice(-RESUME_OVERSHOOT_HISTORY_CAP),
    };
  }

  // Per-resume trend buffer: record EVERY meaningful resume (overshoot
  // or not) so Settings can show a short history under OFFLINE SIM
  // DEPTH. The same shouldShowCatchupPill criterion that gates the home
  // pill applies here so micro-batches don't pollute the list. Stale
  // entries past RESUME_OVERSHOOT_TICK_TTL game-ticks age out before
  // pushing — we share that TTL so both buffers stay in sync.
  if (shouldShowCatchupPill(catchupWallMs, ticksRun)) {
    const cutoff = finalState.totalTicks - RESUME_OVERSHOOT_TICK_TTL;
    const priorSamples = (finalState.recentResumeSamples ?? []).filter(
      (r) => r.atTick >= cutoff,
    );
    const sample: ResumeSampleRecord = {
      ticksProcessed: ticksRun,
      estimatedMs: estimatedWallMs,
      actualMs: catchupWallMs,
      atTick: finalState.totalTicks,
    };
    finalState = {
      ...finalState,
      recentResumeSamples: [...priorSamples, sample].slice(-RESUME_SAMPLE_HISTORY_CAP),
    };
  }

  const simulatedTicks = Math.min(missed, batchLimit);
  const extrapolatedTicks = Math.max(0, missed - simulatedTicks);
  return {
    newState: finalState,
    report: {
      ticksProcessed: missed,
      simulatedTicks,
      extrapolatedTicks,
      summaryEntries: aggregateTickEntries(allEntries),
      offlineSimDepth: depth,
      catchupWallMs,
      estimatedWallMs,
      subsystemErrors: tickErrors,
      suppressedErrors,
      suppressedErrorCount: suppressedCount,
    },
  };
}
