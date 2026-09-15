// Per-tab "coach tip on unlock" for genuinely-new players.
//
// The progressive HUD reveal (engine/hudUnlocks.ts) opens tabs one at a time
// and fires an "X UNLOCKED" toast, but the toast never says what the new screen
// is FOR. This adds a short, one-line coaching note that appears the first time
// a new player opens each newly-unlocked tab, so the disclosure also teaches.
//
// WINDOW / SCOPE: these notes are a first-run aid, not a permanent fixture.
//   - hudCoachTipsActive is a durable OPT-IN flag set `true` ONLY by
//     createInitialState (see engine/initialState.ts). The loader resolves it
//     with a strict `=== true`, so legacy saves (field absent) and veteran
//     starts (explicit `false`) read as off — they never see coach tips. A
//     future "Guided vs Veteran start" toggle flips this `false` for veterans;
//     this flag is the single switch the toggle controls.
//   - hasCompletedOnboarding === true means we only coach AFTER the forced
//     orientation. During orientation the player is pinned to
//     construction/law/inbox, which already show an OnboardingBanner plus their
//     bottom-of-screen *_intro hint — coaching there would triple up. Gating to
//     post-orientation also lets every tab that opens at completion (worldmap,
//     diplomacy, military, ...) actually get its first-visit note.
//   - totalTicks <= HUD_COACH_TIP_TICK_WINDOW keeps the notes to the early game,
//     mirroring the starter-objective marker (engine/objectives.ts) so the two
//     new-player aids share one lifespan.
//
// NOT a duplicate of the *_intro hints: the catalog copy is terse and action-
// oriented and is rendered as a banner at the top of the screen, distinct from
// the verbose *_intro TutorialHints at the bottom of each scroll. The seen-once
// record is the existing TutorialContext (per-device), keyed "coach_<feature>".

import type { GameState } from "@/engine/types";
import {
  ROUTE_FEATURE,
  isHudFeatureUnlocked,
  type HudFeatureId,
} from "@/engine/hudUnlocks";

// Every HUD feature except the always-present CITY/overview tab gets a note.
export type CoachTipFeatureId = Exclude<HudFeatureId, "overview">;

// Coach tips fade out after this many ticks of the first run. Kept equal to the
// starter-objective window on purpose (engine/objectives.ts) so both first-run
// aids disappear together; tune here without touching that one.
export const HUD_COACH_TIP_TICK_WINDOW = 20;

// One terse, action-oriented line per tab. Deliberately distinct from the
// matching *_intro TutorialHint (engine/tutorialHints.ts) — different voice,
// different placement — so the two never read as the same sentence twice.
export const HUD_COACH_TIPS: Record<CoachTipFeatureId, string> = {
  construction:
    "Authorize builds here — housing, services, and industry. The city only grows when concrete moves.",
  law: "Issue edicts here. Spend credits and public trust to force the streets back into line.",
  inbox:
    "Read dispatches here. Crises, intel, and time-sensitive orders all arrive in this channel.",
  economy:
    "Set taxes, procurement, and tariffs here. Every credit you command starts or bleeds on this screen.",
  research:
    "Queue research here. Labs turn time into permanent advantages for the regime.",
  worldmap:
    "Scout the Americas here. Send expeditions to uncover ruins, resources, and threats beyond the wall.",
  diplomacy:
    "Manage rival powers here. Trade, pacts, and grudges decide who answers when you call.",
  more: "Open the command menu here. Records, reports, finances, and deeper systems all live in here.",
  military:
    "Build your forces here. Garrisons, squads, and installations keep the city standing.",
  factions:
    "Track the factions here. Their approval unlocks leverage — and punishes careless rule.",
  events:
    "Handle live events here. Every choice trades one problem for another — there are no clean options.",
  wildlands:
    "Run the wildlands here. Send crews past the perimeter to trade risk for salvage.",
  character:
    "Open your dossier here. Your attributes and choices as commander accumulate in one file.",
};

// The seen-once id stored in TutorialContext for a feature's coach tip.
export function coachTipId(feature: HudFeatureId): string {
  return `coach_${feature}`;
}

// Resolve the current route to the feature whose coach tip should show, or null
// when the route is the always-present CITY tab, an unmapped sub-screen, or has
// no coach copy. Accepts both "/x" and "/(game)/x" pathname forms (expo-router
// strips the "(game)" group from usePathname, so we rebuild it from the tail).
export function coachTipFeatureForRoute(
  pathname: string | null | undefined,
): CoachTipFeatureId | null {
  const seg = (pathname ?? "").split("/").filter(Boolean).pop() ?? "";
  if (!seg) return null;
  const feature = ROUTE_FEATURE[`/(game)/${seg}`];
  if (!feature || feature === "overview") return null;
  if (!(feature in HUD_COACH_TIPS)) return null;
  return feature as CoachTipFeatureId;
}

// The state slice the gate reads. Loose enough to accept real GameState and the
// partial shapes used by the tests.
type CoachTipState = Pick<
  GameState,
  | "hudCoachTipsActive"
  | "hasCompletedOnboarding"
  | "totalTicks"
  | "didBuild"
  | "didEdict"
  | "didRead"
  | "onboardingStep"
>;

// The per-tick, feature-independent half of the gate: a guided new player who is
// past orientation and still inside the early-game window. Cheap and stable —
// pass to useGameStateSelector so the overlay only re-renders when it flips, not
// every tick. Veterans and legacy saves short-circuit on the first clause.
export function isCoachTipWindowActive(state: CoachTipState): boolean {
  if (state.hudCoachTipsActive !== true) return false;
  if (state.hasCompletedOnboarding !== true) return false;
  return (state.totalTicks ?? 0) <= HUD_COACH_TIP_TICK_WINDOW;
}

// Full gate: is a coach tip eligible to show for `feature` right now? Combines
// the early-window check with feature validity and the unlock check. Post-
// orientation isHudFeatureUnlocked is always true, but it is kept so the gate
// stays correct if reveal ordering ever changes. UI-only suppression
// (tipsEnabled) and the seen-once record live in the component, not here.
export function shouldShowHudCoachTip(
  state: CoachTipState,
  feature: HudFeatureId,
): boolean {
  if (!isCoachTipWindowActive(state)) return false;
  if (feature === "overview") return false;
  if (!(feature in HUD_COACH_TIPS)) return false;
  return isHudFeatureUnlocked(feature, state);
}
