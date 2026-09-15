// Starter objectives — a compact, ordered set of early-game goals surfaced to
// genuinely-new players right after the first-run orientation (rendered by the
// StarterObjectiveMarker on the Overview). This is deliberately NOT a quest
// system: it is a single "next concrete goal" pointer that advances as each
// goal is met and fades once the early-game window closes.
//
// It complements — never duplicates — the one-shot inbox tutorial dispatches in
// engine/tutorial.ts. Those teach WHERE things live ("open this tab", "read
// that dispatch"); these starter objectives give the player a short concrete
// survival plan (stabilize morale, grow the count, bank a reserve).
//
// New-player gating keys off the durable `starterObjectivesActive` opt-in flag
// (set `true` only by createInitialState; legacy saves and veteran starts read
// off — see engine/saveLoad.ts), so veterans and existing saves never see it.

import type { GameState } from "@/engine/types";

// The early-game window (in ticks) within which the marker may show. New games
// start tickPaused (see engine/initialState.ts), so this is effectively counted
// from the moment orientation ends. 4 ticks = 1 in-game day (formulas.ts
// ticksPerDay), so 20 ticks covers the first five in-game days — "the first few
// days" the brief calls for, with enough room to actually meet a goal or two.
export const STARTER_OBJECTIVE_TICK_WINDOW = 20;

export type StarterObjectiveProgress = {
  current: number;
  target: number;
  ratio: number; // clamped 0..1
};

export type StarterObjective = {
  id: string;
  // Terse, all-caps marker title in the dystopian command voice.
  label: string;
  // One line: the concrete action the player can take toward the goal.
  directive: string;
  isComplete: (state: GameState) => boolean;
  progress: (state: GameState) => StarterObjectiveProgress;
};

function ratioOf(current: number, target: number): number {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, current / target));
}

// Thresholds sit above the fresh-game baselines (happiness 45, population
// 980,300, credits 500,000 — see engine/initialState.ts) so the opening
// objective is never pre-satisfied. Guarded by engine/__tests__/objectives.test.ts.
const HAPPINESS_TARGET = 55;
const POPULATION_TARGET = 1_000_000;
const CREDITS_TARGET = 600_000;

// Ordered: the marker shows the first incomplete objective and advances as each
// is met. A "stabilize → grow → bank" arc that reads as a coherent early plan.
export const STARTER_OBJECTIVES: StarterObjective[] = [
  {
    id: "stabilize_morale",
    label: "STABILIZE MORALE",
    directive: "Lift happiness to 55. Ease rationing or improve civic conditions.",
    isComplete: (s) => s.cityStats.happiness >= HAPPINESS_TARGET,
    progress: (s) => ({
      current: Math.round(s.cityStats.happiness),
      target: HAPPINESS_TARGET,
      ratio: ratioOf(s.cityStats.happiness, HAPPINESS_TARGET),
    }),
  },
  {
    id: "expand_the_count",
    label: "EXPAND THE COUNT",
    directive: "Grow to 1,000,000 citizens. Add housing and keep services positive.",
    isComplete: (s) => s.cityStats.population >= POPULATION_TARGET,
    progress: (s) => ({
      current: Math.round(s.cityStats.population),
      target: POPULATION_TARGET,
      ratio: ratioOf(s.cityStats.population, POPULATION_TARGET),
    }),
  },
  {
    id: "build_a_reserve",
    label: "BUILD A RESERVE",
    directive: "Bank 600,000 credits. Keep revenue above spending.",
    isComplete: (s) => s.resources.credits >= CREDITS_TARGET,
    progress: (s) => ({
      current: Math.round(s.resources.credits),
      target: CREDITS_TARGET,
      ratio: ratioOf(s.resources.credits, CREDITS_TARGET),
    }),
  },
];

// The first incomplete objective, or null when every objective is met. Skips
// any objective already satisfied (so a pre-satisfied opener is passed over).
export function getCurrentStarterObjective(state: GameState): StarterObjective | null {
  for (const obj of STARTER_OBJECTIVES) {
    if (!obj.isComplete(state)) return obj;
  }
  return null;
}

// 1-based index of the current objective within the ordered list (for an
// "N OF M" readout). 0 when no objective is current (all complete).
export function currentStarterObjectiveIndex(state: GameState): number {
  const current = getCurrentStarterObjective(state);
  if (!current) return 0;
  return STARTER_OBJECTIVES.findIndex((o) => o.id === current.id) + 1;
}

// Whether the marker should be visible. Pure function of GameState so it can be
// unit-tested and reused. Note: this does NOT consider the `tipsEnabled`
// setting (a UI-only global guidance switch) — the component layers that on top
// (hiding while tips are off without recording a permanent dismissal).
export function shouldShowStarterObjectives(state: GameState): boolean {
  // Strict opt-in: veterans and legacy saves (field absent / false) never see it.
  if (state.starterObjectivesActive !== true) return false;
  // Only after orientation is finished or skipped (avoids competing with the
  // OnboardingBanner during the live walkthrough).
  if (state.hasCompletedOnboarding !== true) return false;
  // Permanent per-save dismissal.
  if (state.starterObjectivesDismissed === true) return false;
  // Fades once the early-game window closes.
  if (state.totalTicks > STARTER_OBJECTIVE_TICK_WINDOW) return false;
  // Nothing left to point at.
  return getCurrentStarterObjective(state) !== null;
}
