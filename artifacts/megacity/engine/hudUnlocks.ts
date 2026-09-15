// Progressive HUD disclosure for new players.
//
// A brand-new game starts with most of the interface hidden so the player is
// not overwhelmed by 7 top tabs + 7 quick-bar items + ~25 screens on turn 0.
// Features reveal as the player advances through the first-run orientation
// (see engine/onboardingFlow.ts), and everything unlocks once the orientation
// is finished.
//
// SAFETY: the lock is ONLY ever active for fresh games. createInitialState sets
// hasCompletedOnboarding to false; the loader backfills legacy saves to `true`
// (treating undefined as complete), and "Skip Intro" / finishing the
// orientation both flip it to `true`. So veterans, skipped runs, and existing
// saves always see the full HUD — we never take a tab away from someone who
// already has it.

import type { GameState } from "@/engine/types";
import { latestReachedBeat, type OnboardingBeat } from "@/engine/onboardingFlow";

export type HudFeatureId =
  // top nav (overview/CITY is always available)
  | "overview"
  | "law"
  | "economy"
  | "worldmap"
  | "construction"
  | "diplomacy"
  | "more"
  // bottom quick bar
  | "inbox"
  | "research"
  | "military"
  | "factions"
  | "events"
  | "wildlands"
  | "character";

// Maps a game route to the HUD feature that gates it. Routes absent from this
// map (sub-screens, debug, settings, etc.) are always considered unlocked.
export const ROUTE_FEATURE: Record<string, HudFeatureId> = {
  "/(game)/overview": "overview",
  "/(game)/law": "law",
  "/(game)/economy": "economy",
  "/(game)/worldmap": "worldmap",
  "/(game)/construction": "construction",
  "/(game)/diplomacy": "diplomacy",
  "/(game)/more": "more",
  "/(game)/inbox": "inbox",
  "/(game)/research": "research",
  "/(game)/military": "military",
  "/(game)/factions": "factions",
  "/(game)/events": "events",
  "/(game)/wildlands": "wildlands",
  "/(game)/character": "character",
};

// Short label announced in the "X UNLOCKED" toast when a feature reveals.
export const FEATURE_UNLOCK_LABEL: Record<HudFeatureId, string> = {
  overview: "CITY",
  construction: "CONSTRUCTION",
  law: "LAW & ORDER",
  inbox: "DISPATCH INBOX",
  economy: "ECONOMY",
  research: "RESEARCH",
  worldmap: "WORLD MAP",
  diplomacy: "DIPLOMACY",
  more: "COMMAND MENU",
  military: "MILITARY",
  factions: "FACTIONS",
  events: "EVENTS",
  wildlands: "WILDLANDS",
  character: "DOSSIER",
};

// Beat ordering as a numeric rank so we can express "reveal at or after beat X".
const BEAT_RANK: Record<OnboardingBeat, number> = {
  arrival: 0,
  build: 1,
  edict: 2,
  dispatch: 3,
  summary: 4,
};

// A rank above any real beat: these features only appear once the orientation
// is fully complete (which lifts the intro lock entirely — see below). Kept in
// the reveal table purely so getUnlockedHudFeatures enumerates every feature.
const AFTER_COMPLETE = 99;

// The beat rank at which each feature reveals during the first-run walkthrough.
// The three action beats reveal the tab they route the player to (build ->
// CONSTRUCTION, edict -> LAW, dispatch -> INBOX); the summary beat reveals the
// two most useful management screens; everything else opens on completion.
const FEATURE_REVEAL_RANK: Record<HudFeatureId, number> = {
  overview: 0,
  construction: 1,
  law: 2,
  inbox: 3,
  economy: 4,
  research: 4,
  worldmap: AFTER_COMPLETE,
  diplomacy: AFTER_COMPLETE,
  more: AFTER_COMPLETE,
  military: AFTER_COMPLETE,
  factions: AFTER_COMPLETE,
  events: AFTER_COMPLETE,
  wildlands: AFTER_COMPLETE,
  character: AFTER_COMPLETE,
};

const ALL_FEATURES = Object.keys(FEATURE_REVEAL_RANK) as HudFeatureId[];

type UnlockState = Pick<
  GameState,
  "hasCompletedOnboarding" | "didBuild" | "didEdict" | "didRead" | "onboardingStep"
>;

// True only for fresh games still inside the first-run orientation. Once the
// orientation is finished or skipped (hasCompletedOnboarding === true) or the
// save predates the field (undefined => legacy veteran), the lock is off and
// the full HUD is shown.
export function isIntroLockActive(state: Pick<GameState, "hasCompletedOnboarding">): boolean {
  return state.hasCompletedOnboarding === false;
}

// True once the first-run intro lock is lifted (veterans, skipped runs, legacy
// saves). Returns a primitive so it can be passed straight to
// useGameStateSelector; the top bar uses it to decide whether the extended
// (promoted) tabs may appear.
export function introLockLifted(state: Pick<GameState, "hasCompletedOnboarding">): boolean {
  return !isIntroLockActive(state);
}

// The set of HUD features currently visible/usable.
export function getUnlockedHudFeatures(state: UnlockState): Set<HudFeatureId> {
  if (!isIntroLockActive(state)) return new Set(ALL_FEATURES);
  const rank = BEAT_RANK[latestReachedBeat(state)];
  return new Set(ALL_FEATURES.filter((f) => FEATURE_REVEAL_RANK[f] <= rank));
}

export function isHudFeatureUnlocked(featureId: HudFeatureId, state: UnlockState): boolean {
  if (!isIntroLockActive(state)) return true;
  return FEATURE_REVEAL_RANK[featureId] <= BEAT_RANK[latestReachedBeat(state)];
}

// Whether a given route is reachable right now. Non-gated routes always return
// true. Accepts both "/(game)/x" and "/x" forms.
export function isRouteUnlocked(route: string, state: UnlockState): boolean {
  const normalized = route.startsWith("/(game)") ? route : `/(game)${route}`;
  const featureId = ROUTE_FEATURE[normalized];
  if (!featureId) return true;
  return isHudFeatureUnlocked(featureId, state);
}

// Compact, comma-separated signature of the currently-unlocked features. Pass
// directly to useGameStateSelector: it returns a primitive string, so a
// component re-renders only when the unlock set actually changes (not every
// tick). Callers rebuild a Set from it to filter their nav items.
export function unlockedHudFeaturesCsv(state: UnlockState): string {
  return [...getUnlockedHudFeatures(state)].join(",");
}
