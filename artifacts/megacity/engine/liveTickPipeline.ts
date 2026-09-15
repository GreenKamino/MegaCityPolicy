// Shared, node-safe implementation of ONE live simulation tick.
//
// Historically the full per-tick pipeline lived inline inside GameContext's
// setInterval `tick()` and was hand-copied into `forceTick`; the two drifted
// (forceTick was missing diplomatic responses, partner effects, the end-state
// check and tutorial inboxes). This module is the single source of truth for
// the pure, data-only portion of a tick. All React/Steam/audio side effects
// (sounds, haptics, rich presence, pending-achievement queue, perf timing,
// tick-error surfacing) stay in the caller, driven entirely by the returned
// payload. GameContext.tick(), GameContext.forceTick() and turnMode.advanceTurn
// all consume this so a change to the pipeline is applied everywhere at once.

import type {
  GameState,
  GameEvent,
  GameMessage,
  TickEntry,
} from "@/engine/types";
import { negativeEventsAllowed } from "@/engine/calmStart";
import { runTick, getLastTickErrors, type TickSubsystemError } from "@/engine/formulas";
import { isEarlyGame, getNextTutorialTip } from "@/engine/tutorial";
import {
  applyEventEffects,
  generateRandomEvent,
  resetEndedWarEventOccurrences,
} from "@/engine/events";
import { processMegaProjectTick, generateMegaProjectMessage, type MegaProjectId } from "@/engine/megaProjects";
import { processOfficerMissionTick, generateMissionMessage } from "@/engine/officerMissions";
import { processPendingResponses } from "@/engine/diplomaticFollowUps";
import { pruneIntel } from "@/engine/intelEngine";
import { applyPartnerAndPlayerTickEffects } from "@/engine/partnerCityStats";
import { processEndStateCheck } from "@/engine/endState";
import { checkAchievements } from "@/engine/achievements";
import { ARRAY_CAPS } from "@/engine/sanitizer";

// __DEV__ is injected by the React Native/Expo bundler but is undefined under
// plain Node (vitest). Resolve it once so this module never ReferenceErrors and
// still stays quiet in production builds.
const IS_DEV = typeof __DEV__ !== "undefined" && !!__DEV__;

type MissionResults = ReturnType<typeof processOfficerMissionTick>["results"];

// Everything a caller needs to (a) commit the new state and (b) fire the
// impure feedback (sounds, haptics, Steam unlocks, toasts) that used to be
// interleaved with the pure work.
export type LiveTickResult = {
  // Fully-processed next state: includes inbox messages and unlocked
  // achievements already folded in.
  state: GameState;
  // Resource ledger entries produced by runTick (used for turn recaps).
  entries: TickEntry[];
  // The random event that fired this tick (if any), for audio cues + recaps.
  firedEvent: GameEvent | null;
  // Technology ids unlocked this tick, relative to the input state.
  newTechnologies: string[];
  megaPlanningComplete: MegaProjectId[];
  megaCompleted: MegaProjectId[];
  megaNewlyEligible: MegaProjectId[];
  missionResults: MissionResults;
  // Inbox messages generated this tick (tutorial tips, mega/mission updates).
  inboxMessages: GameMessage[];
  // Achievement ids newly unlocked this tick (already added to state).
  newAchievements: string[];
  // Subsystem errors from THIS tick only. getLastTickErrors() resets on every
  // runTick(), so callers looping over ticks must read this per iteration.
  tickErrors: TickSubsystemError[];
};

// Run one full live tick. Pure w.r.t. React/Steam/audio: no timers, no setState,
// no sound. `prev` must already have passed whatever pause/mode gating the
// caller enforces — this always advances the simulation by exactly one tick.
export function runLiveTick(prev: GameState): LiveTickResult {
  const { newState, entries } = runTick(prev);
  const stateAfterWarCleanup = resetEndedWarEventOccurrences(newState);
  // Keep every event source inside the per-save calm window. The demo fixtures
  // use a longer calm window so a multi-turn screenshot/browser check cannot be
  // interrupted by a random crisis after the generic tutorial threshold.
  const earlyGame = isEarlyGame(stateAfterWarCleanup) || !negativeEventsAllowed(stateAfterWarCleanup);

  let evtResult: ReturnType<typeof generateRandomEvent> = null;
  try {
    evtResult = earlyGame ? null : generateRandomEvent(stateAfterWarCleanup);
  } catch (e) {
    if (IS_DEV) console.warn("[TICK] Event generation failed:", e);
  }

  let s = evtResult
    ? applyEventEffects(stateAfterWarCleanup, evtResult.event)
    : stateAfterWarCleanup;
  if (evtResult?.cooldowns) s = { ...s, eventTriggerCooldowns: evtResult.cooldowns };
  if (evtResult?.eventRecurrenceCounts) {
    s = { ...s, eventRecurrenceCounts: evtResult.eventRecurrenceCounts };
  }
  if (evtResult?.warEventOccurrences) {
    s = { ...s, warEventOccurrences: evtResult.warEventOccurrences };
  }
  const firedEvent: GameEvent | null = evtResult ? evtResult.event : null;

  let megaResult: ReturnType<typeof processMegaProjectTick> = { state: s, planningComplete: [], completed: [], newlyEligible: [] };
  try {
    megaResult = processMegaProjectTick(s);
    s = megaResult.state;
  } catch (e) {
    if (IS_DEV) console.warn("[TICK] Mega project processing failed:", e);
  }

  let missionResult: ReturnType<typeof processOfficerMissionTick> = { state: s, results: [] };
  try {
    missionResult = processOfficerMissionTick(s);
    s = missionResult.state;
  } catch (e) {
    if (IS_DEV) console.warn("[TICK] Officer mission processing failed:", e);
  }

  try {
    s = processPendingResponses(s);
    if ((s.intelItems?.length ?? 0) > 0) {
      s = { ...s, intelItems: pruneIntel(s.intelItems ?? [], s.totalTicks) };
    }
  } catch (e) {
    if (IS_DEV) console.warn("[TICK] Pending diplomatic responses failed:", e);
  }

  try {
    const eff = applyPartnerAndPlayerTickEffects(s);
    s = {
      ...eff.state,
      messages: [...eff.alerts, ...(eff.state.messages ?? [])].slice(0, ARRAY_CAPS.messages),
    };
  } catch (e) {
    if (IS_DEV) console.warn("[TICK] Partner city tribute/recovery failed:", e);
  }

  // City-end condition. Runs AFTER partner effects so hostile strikes that zero
  // out pop trigger the fall this tick instead of next. Idempotent.
  try {
    const endEntries: TickEntry[] = [];
    processEndStateCheck(s, endEntries);
    if (endEntries.length > 0) {
      s = { ...s, tickLog: [...endEntries, ...(s.tickLog ?? [])].slice(0, ARRAY_CAPS.tickLog) };
    }
  } catch (e) {
    if (IS_DEV) console.warn("[TICK] End-state check failed:", e);
  }

  const inboxMessages: GameMessage[] = [];
  const tutorialTip = getNextTutorialTip(s);
  if (tutorialTip) {
    const dismissed = s.dismissedTutorialTips ?? [];
    s = { ...s, dismissedTutorialTips: [...dismissed, tutorialTip.id] };
    inboxMessages.push({
      id: `tutorial-${tutorialTip.id}`,
      timestamp: s.gameDate,
      tick: s.totalTicks,
      category: "update",
      title: tutorialTip.title,
      body: tutorialTip.body,
      read: false,
      priority: "high",
    });
  }
  for (const pid of megaResult.planningComplete) {
    inboxMessages.push(generateMegaProjectMessage(pid, "planning_complete", s.gameDate, s.totalTicks, s));
  }
  for (const pid of megaResult.completed) {
    inboxMessages.push(generateMegaProjectMessage(pid, "construction_complete", s.gameDate, s.totalTicks, s));
  }
  for (const pid of megaResult.newlyEligible) {
    inboxMessages.push(generateMegaProjectMessage(pid, "newly_available", s.gameDate, s.totalTicks, s));
  }
  for (const mr of missionResult.results) {
    const message = generateMissionMessage(mr, s.gameDate, s.totalTicks);
    if (
      !s.dismissedMessageIds?.includes(message.id) &&
      !(s.messages ?? []).some((existing) => existing.id === message.id) &&
      !inboxMessages.some((existing) => existing.id === message.id)
    ) {
      inboxMessages.push(message);
    }
  }
  if (inboxMessages.length > 0) {
    s = { ...s, messages: [...inboxMessages, ...s.messages].slice(0, ARRAY_CAPS.messages) };
  }

  const newTechnologies = s.unlockedTechnologies.filter((t) => !prev.unlockedTechnologies.includes(t));

  const newAchievements = checkAchievements(s);
  if (newAchievements.length > 0) {
    s = { ...s, unlockedAchievements: [...(s.unlockedAchievements ?? []), ...newAchievements] };
  }

  // Read AFTER all processing but before returning — nothing above calls
  // runTick again, so this still reflects this tick's runTick errors.
  const tickErrors = getLastTickErrors();

  return {
    state: s,
    entries,
    firedEvent,
    newTechnologies,
    megaPlanningComplete: megaResult.planningComplete,
    megaCompleted: megaResult.completed,
    megaNewlyEligible: megaResult.newlyEligible,
    missionResults: missionResult.results,
    inboxMessages,
    newAchievements,
    tickErrors,
  };
}
