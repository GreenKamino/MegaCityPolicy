// Personal Goals — three rotating short/mid/long goals derived from existing
// player counters. Pure functions; the GameContext owns the persisted state
// slice and dispatches refresh / claim actions through these helpers.
//
// Goal lifecycle:
//   1. refreshPersonalGoals() fills any empty scope slot with a fresh
//      template, snapshotting the relevant counter as the baseline.
//   2. getGoalProgress() returns (current - baseline) clamped at 0..target.
//   3. claimPersonalGoal() requires the goal to be complete; it returns the
//      reward, marks the template as completed, and clears the slot so the
//      next refresh picks something new.

import type { GameState } from "@/engine/types";

export type GoalScope = "short" | "mid" | "long";

export type GoalStatKey =
  | "totalDecisions"
  | "contractsCompleted"
  | "criminalsSentenced"
  | "riotsQuelled"
  | "totalTicks"
  | "eventsResolved"
  | "researchUnlocked"
  | "missionsCompleted"
  | "populationGrowth";

export type GoalTemplate = {
  id: string;
  scope: GoalScope;
  title: string;
  description: string;
  statKey: GoalStatKey;
  target: number;
  rewardCredits: number;
  rewardXp: number;
};

export type PersonalGoalSlot = {
  templateId: string;
  baseline: number;
  startedTick: number;
};

export type PersonalGoalsState = {
  short: PersonalGoalSlot | null;
  mid: PersonalGoalSlot | null;
  long: PersonalGoalSlot | null;
  completedIds: string[];
  totalClaimed: number;
};

export const PERSONAL_GOAL_TEMPLATES: GoalTemplate[] = [
  // ── SHORT ──
  {
    id: "short_decisions_10",
    scope: "short",
    title: "EXECUTIVE BURST",
    description: "Issue 10 command decisions.",
    statKey: "totalDecisions",
    target: 10,
    rewardCredits: 4_000,
    rewardXp: 50,
  },
  {
    id: "short_contracts_3",
    scope: "short",
    title: "PROCUREMENT SPRINT",
    description: "Complete 3 city contracts.",
    statKey: "contractsCompleted",
    target: 3,
    rewardCredits: 6_000,
    rewardXp: 60,
  },
  {
    id: "short_criminals_15",
    scope: "short",
    title: "STREET SWEEP",
    description: "Sentence 15 criminals.",
    statKey: "criminalsSentenced",
    target: 15,
    rewardCredits: 5_000,
    rewardXp: 50,
  },
  {
    id: "short_riots_2",
    scope: "short",
    title: "ORDER RESTORED",
    description: "Quell 2 riots.",
    statKey: "riotsQuelled",
    target: 2,
    rewardCredits: 7_000,
    rewardXp: 70,
  },
  {
    id: "short_events_5",
    scope: "short",
    title: "CRISIS DESK",
    description: "Resolve 5 events.",
    statKey: "eventsResolved",
    target: 5,
    rewardCredits: 5_000,
    rewardXp: 55,
  },

  // ── MID ──
  {
    id: "mid_decisions_75",
    scope: "mid",
    title: "STEADY HAND",
    description: "Issue 75 command decisions.",
    statKey: "totalDecisions",
    target: 75,
    rewardCredits: 25_000,
    rewardXp: 250,
  },
  {
    id: "mid_contracts_15",
    scope: "mid",
    title: "BUILD CYCLE",
    description: "Complete 15 city contracts.",
    statKey: "contractsCompleted",
    target: 15,
    rewardCredits: 35_000,
    rewardXp: 280,
  },
  {
    id: "mid_research_5",
    scope: "mid",
    title: "LAB QUOTA",
    description: "Unlock 5 new technologies.",
    statKey: "researchUnlocked",
    target: 5,
    rewardCredits: 30_000,
    rewardXp: 300,
  },
  {
    id: "mid_ticks_30",
    scope: "mid",
    title: "ADMINISTRATIVE TENURE",
    description: "Govern for 30 more ticks.",
    statKey: "totalTicks",
    target: 30,
    rewardCredits: 20_000,
    rewardXp: 220,
  },
  {
    id: "mid_population_growth_5k",
    scope: "mid",
    title: "BABY BOOM",
    description: "Grow the population by 5,000.",
    statKey: "populationGrowth",
    target: 5_000,
    rewardCredits: 28_000,
    rewardXp: 260,
  },

  // ── LONG ──
  {
    id: "long_decisions_500",
    scope: "long",
    title: "IRON MANDATE",
    description: "Issue 500 command decisions.",
    statKey: "totalDecisions",
    target: 500,
    rewardCredits: 150_000,
    rewardXp: 1_500,
  },
  {
    id: "long_contracts_50",
    scope: "long",
    title: "INDUSTRIAL LEGACY",
    description: "Complete 50 city contracts.",
    statKey: "contractsCompleted",
    target: 50,
    rewardCredits: 200_000,
    rewardXp: 1_800,
  },
  {
    id: "long_research_25",
    scope: "long",
    title: "ENLIGHTENMENT",
    description: "Unlock 25 new technologies.",
    statKey: "researchUnlocked",
    target: 25,
    rewardCredits: 220_000,
    rewardXp: 2_000,
  },
  {
    id: "long_criminals_300",
    scope: "long",
    title: "JUSTICE DOCTRINE",
    description: "Sentence 300 criminals.",
    statKey: "criminalsSentenced",
    target: 300,
    rewardCredits: 180_000,
    rewardXp: 1_700,
  },
  {
    id: "long_missions_20",
    scope: "long",
    title: "FIELD COMMANDER",
    description: "Complete 20 officer missions.",
    statKey: "missionsCompleted",
    target: 20,
    rewardCredits: 175_000,
    rewardXp: 1_600,
  },
];

export function createDefaultPersonalGoals(): PersonalGoalsState {
  return {
    short: null,
    mid: null,
    long: null,
    completedIds: [],
    totalClaimed: 0,
  };
}

export function getTemplate(id: string): GoalTemplate | undefined {
  return PERSONAL_GOAL_TEMPLATES.find((t) => t.id === id);
}

export function readGoalStat(state: GameState, key: GoalStatKey, baseline = 0): number {
  switch (key) {
    case "totalDecisions": return state.player?.totalDecisions ?? 0;
    case "contractsCompleted": return state.player?.contractsCompleted ?? 0;
    case "criminalsSentenced": return state.player?.criminalsSentenced ?? 0;
    case "riotsQuelled": return state.player?.riotsQuelled ?? 0;
    case "totalTicks": return state.totalTicks ?? 0;
    case "eventsResolved": return (state.eventHistory ?? []).length;
    case "researchUnlocked": return (state.unlockedTechnologies ?? []).length;
    case "missionsCompleted":
      return (state.totalMissionsSucceeded ?? 0)
        + (state.militaryOverhaul?.completedMissions ?? 0);
    case "populationGrowth":
      // For population growth, the "current" value is the city's population
      // and the baseline is captured at goal start. The check function then
      // computes (current - baseline) as progress.
      return state.cityStats?.population ?? baseline;
  }
}

export function getGoalProgress(slot: PersonalGoalSlot, state: GameState): { current: number; target: number } {
  const tpl = getTemplate(slot.templateId);
  if (!tpl) return { current: 0, target: 0 };
  const raw = readGoalStat(state, tpl.statKey, slot.baseline);
  const current = Math.max(0, Math.min(tpl.target, raw - slot.baseline));
  return { current, target: tpl.target };
}

export function isGoalComplete(slot: PersonalGoalSlot, state: GameState): boolean {
  const { current, target } = getGoalProgress(slot, state);
  return target > 0 && current >= target;
}

function pickTemplate(
  scope: GoalScope,
  excludeIds: ReadonlySet<string>,
  seed: number,
): GoalTemplate | null {
  const candidates = PERSONAL_GOAL_TEMPLATES.filter(
    (t) => t.scope === scope && !excludeIds.has(t.id),
  );
  if (candidates.length === 0) {
    // All templates of this scope have been completed — allow repeats.
    const repeatable = PERSONAL_GOAL_TEMPLATES.filter((t) => t.scope === scope);
    if (repeatable.length === 0) return null;
    return repeatable[seed % repeatable.length];
  }
  return candidates[seed % candidates.length];
}

export function refreshPersonalGoals(
  current: PersonalGoalsState | undefined,
  state: GameState,
  opts?: { seed?: number },
): PersonalGoalsState {
  const next = current ? { ...current } : createDefaultPersonalGoals();
  const seedBase = opts?.seed ?? (state.totalTicks ?? 0);
  const tick = state.totalTicks ?? 0;
  const completed = new Set(next.completedIds);

  // Track the templates already in use across other slots so we don't pick
  // duplicates simultaneously.
  const inUse = new Set<string>();
  if (next.short) inUse.add(next.short.templateId);
  if (next.mid) inUse.add(next.mid.templateId);
  if (next.long) inUse.add(next.long.templateId);

  const scopes: GoalScope[] = ["short", "mid", "long"];
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    if (next[scope]) continue;
    const exclude = new Set<string>([...completed, ...inUse]);
    const tpl = pickTemplate(scope, exclude, seedBase + i);
    if (!tpl) continue;
    const baseline = readGoalStat(state, tpl.statKey);
    next[scope] = { templateId: tpl.id, baseline, startedTick: tick };
    inUse.add(tpl.id);
  }

  return next;
}

export type ClaimResult = {
  state: PersonalGoalsState;
  reward: { credits: number; xp: number };
  templateId: string;
};

export function claimPersonalGoal(
  current: PersonalGoalsState | undefined,
  state: GameState,
  scope: GoalScope,
): ClaimResult | null {
  if (!current) return null;
  const slot = current[scope];
  if (!slot) return null;
  if (!isGoalComplete(slot, state)) return null;
  const tpl = getTemplate(slot.templateId);
  if (!tpl) return null;
  const next: PersonalGoalsState = {
    ...current,
    [scope]: null,
    completedIds: current.completedIds.includes(slot.templateId)
      ? current.completedIds
      : [...current.completedIds, slot.templateId],
    totalClaimed: current.totalClaimed + 1,
  };
  return {
    state: next,
    reward: { credits: tpl.rewardCredits, xp: tpl.rewardXp },
    templateId: slot.templateId,
  };
}
