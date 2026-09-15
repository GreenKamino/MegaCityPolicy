import { describe, expect, it } from "vitest";

import {
  PERSONAL_GOAL_TEMPLATES,
  claimPersonalGoal,
  createDefaultPersonalGoals,
  getGoalProgress,
  getTemplate,
  isGoalComplete,
  readGoalStat,
  refreshPersonalGoals,
  type PersonalGoalsState,
} from "@/engine/personalGoals";
import type { GameState } from "@/engine/types";

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    totalTicks: 100,
    player: { totalDecisions: 0, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 },
    eventHistory: [],
    unlockedTechnologies: [],
    cityStats: { population: 100_000 },
    ...over,
  } as unknown as GameState;
}

describe("personalGoals.PERSONAL_GOAL_TEMPLATES", () => {
  it("has at least one template per scope", () => {
    const scopes = new Set(PERSONAL_GOAL_TEMPLATES.map((t) => t.scope));
    expect(scopes.has("short")).toBe(true);
    expect(scopes.has("mid")).toBe(true);
    expect(scopes.has("long")).toBe(true);
  });

  it("has unique ids", () => {
    const ids = PERSONAL_GOAL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("targets and rewards are positive", () => {
    for (const t of PERSONAL_GOAL_TEMPLATES) {
      expect(t.target).toBeGreaterThan(0);
      expect(t.rewardCredits).toBeGreaterThan(0);
      expect(t.rewardXp).toBeGreaterThan(0);
    }
  });
});

describe("personalGoals.readGoalStat", () => {
  it("reads player counters", () => {
    const state = makeState({ player: { totalDecisions: 7, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    expect(readGoalStat(state, "totalDecisions")).toBe(7);
  });

  it("reads totalTicks", () => {
    expect(readGoalStat(makeState({ totalTicks: 42 }), "totalTicks")).toBe(42);
  });

  it("reads eventHistory length", () => {
    const state = makeState({ eventHistory: [{}, {}, {}] as any });
    expect(readGoalStat(state, "eventsResolved")).toBe(3);
  });

  it("reads researchUnlocked length", () => {
    expect(readGoalStat(makeState({ unlockedTechnologies: ["a", "b"] }), "researchUnlocked")).toBe(2);
  });

  it("reads populationGrowth as cityStats.population", () => {
    const state = makeState({ cityStats: { population: 250_000 } as any });
    expect(readGoalStat(state, "populationGrowth")).toBe(250_000);
  });

  it("populationGrowth falls back to baseline when missing", () => {
    expect(readGoalStat({} as GameState, "populationGrowth", 999)).toBe(999);
  });

  it("missionsCompleted sums totalMissionsSucceeded and militaryOverhaul.completedMissions", () => {
    const state = makeState({ totalMissionsSucceeded: 3, militaryOverhaul: { completedMissions: 4 } as any });
    expect(readGoalStat(state, "missionsCompleted")).toBe(7);
  });
});

describe("personalGoals.refreshPersonalGoals", () => {
  it("fills all three slots from an empty state", () => {
    const next = refreshPersonalGoals(undefined, makeState(), { seed: 0 });
    expect(next.short).not.toBeNull();
    expect(next.mid).not.toBeNull();
    expect(next.long).not.toBeNull();
  });

  it("is idempotent when all slots are filled", () => {
    const a = refreshPersonalGoals(undefined, makeState(), { seed: 0 });
    const b = refreshPersonalGoals(a, makeState(), { seed: 0 });
    expect(b).toEqual(a);
  });

  it("snapshots the current counter as baseline", () => {
    const state = makeState({ player: { totalDecisions: 50, contractsCompleted: 10, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    const next = refreshPersonalGoals(undefined, state, { seed: 0 });
    for (const scope of ["short", "mid", "long"] as const) {
      const slot = next[scope]!;
      const tpl = getTemplate(slot.templateId)!;
      const expected = readGoalStat(state, tpl.statKey);
      expect(slot.baseline).toBe(expected);
    }
  });

  it("avoids picking a previously completed template when alternatives exist", () => {
    const state = makeState();
    const completed = PERSONAL_GOAL_TEMPLATES.filter((t) => t.scope === "short").map((t) => t.id).slice(0, 1);
    const seeded: PersonalGoalsState = { ...createDefaultPersonalGoals(), completedIds: completed };
    const next = refreshPersonalGoals(seeded, state, { seed: 0 });
    expect(completed).not.toContain(next.short!.templateId);
  });
});

describe("personalGoals.getGoalProgress / isGoalComplete", () => {
  it("clamps progress at 0", () => {
    const slot = { templateId: "short_decisions_10", baseline: 100, startedTick: 0 };
    const state = makeState({ player: { totalDecisions: 50, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    expect(getGoalProgress(slot, state).current).toBe(0);
  });

  it("clamps progress at target", () => {
    const slot = { templateId: "short_decisions_10", baseline: 0, startedTick: 0 };
    const state = makeState({ player: { totalDecisions: 999, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    const p = getGoalProgress(slot, state);
    expect(p.current).toBe(p.target);
  });

  it("isGoalComplete is true when current >= target", () => {
    const slot = { templateId: "short_decisions_10", baseline: 0, startedTick: 0 };
    const state = makeState({ player: { totalDecisions: 10, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    expect(isGoalComplete(slot, state)).toBe(true);
  });

  it("isGoalComplete is false otherwise", () => {
    const slot = { templateId: "short_decisions_10", baseline: 0, startedTick: 0 };
    const state = makeState({ player: { totalDecisions: 5, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    expect(isGoalComplete(slot, state)).toBe(false);
  });

  it("returns target 0 when template id is unknown", () => {
    const slot = { templateId: "nope", baseline: 0, startedTick: 0 };
    expect(getGoalProgress(slot, makeState()).target).toBe(0);
  });
});

describe("personalGoals.claimPersonalGoal", () => {
  it("returns null when goal is not complete", () => {
    const filled = refreshPersonalGoals(undefined, makeState(), { seed: 0 });
    expect(claimPersonalGoal(filled, makeState(), "short")).toBeNull();
  });

  it("returns reward + clears slot when complete", () => {
    // Force a known short template
    const slot = { templateId: "short_decisions_10", baseline: 0, startedTick: 0 };
    const filled: PersonalGoalsState = { short: slot, mid: null, long: null, completedIds: [], totalClaimed: 0 };
    const state = makeState({ player: { totalDecisions: 10, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    const result = claimPersonalGoal(filled, state, "short");
    expect(result).not.toBeNull();
    expect(result!.reward.credits).toBeGreaterThan(0);
    expect(result!.state.short).toBeNull();
    expect(result!.state.completedIds).toContain("short_decisions_10");
    expect(result!.state.totalClaimed).toBe(1);
  });

  it("returns null when state is undefined", () => {
    expect(claimPersonalGoal(undefined, makeState(), "short")).toBeNull();
  });

  it("does not duplicate completedIds on repeat completions", () => {
    const slot = { templateId: "short_decisions_10", baseline: 0, startedTick: 0 };
    const filled: PersonalGoalsState = {
      short: slot,
      mid: null,
      long: null,
      completedIds: ["short_decisions_10"],
      totalClaimed: 1,
    };
    const state = makeState({ player: { totalDecisions: 10, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0 } as any });
    const result = claimPersonalGoal(filled, state, "short")!;
    const occurrences = result.state.completedIds.filter((id) => id === "short_decisions_10").length;
    expect(occurrences).toBe(1);
  });
});

describe("personalGoals.createDefaultPersonalGoals", () => {
  it("starts with empty slots and counters", () => {
    const s = createDefaultPersonalGoals();
    expect(s.short).toBeNull();
    expect(s.mid).toBeNull();
    expect(s.long).toBeNull();
    expect(s.completedIds).toEqual([]);
    expect(s.totalClaimed).toBe(0);
  });
});
