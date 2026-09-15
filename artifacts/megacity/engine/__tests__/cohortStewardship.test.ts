import { describe, expect, it } from "vitest";

import { applyCoerciveBacklash } from "@/engine/coerciveBacklash";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import {
  COHORT_STEWARDSHIP_ACTION_ORDER,
  COHORT_STEWARDSHIP_TARGETS,
  PERSONAL_ACTIONS,
  applyPersonalInteraction,
  evaluatePersonalAction,
  getCohortStewardshipActions,
  personalCooldownRemaining,
  type CohortStewardshipTargetId,
  type PersonalActionId,
  type PersonalInteractionTarget,
} from "@/engine/interactionMenu";
import { computePopulationCohorts } from "@/engine/populationCohorts";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";
import { getWorkforceCatalog } from "@/engine/workforceCatalog";

function readyState(): GameState {
  const state = createInitialState();
  state.totalTicks = 100;
  state.cityStats = {
    ...state.cityStats,
    population: 1_000_000,
    housingPressure: 70,
    diseaseRisk: 70,
    employment: 50,
    unrest: 60,
    crime: 70,
    corruption: 30,
  };
  state.demographics = {
    ...state.demographics,
    totalPopulation: 1_000_000,
    totalWorkforce: 600_000,
    unemploymentRate: 50,
    employmentRate: 50,
    highIncomePopulation: 50_000,
    corporateCitizens: 25_000,
  };
  state.buildings = {
    ...state.buildings,
    correctionalWorkCamps: 10,
    megaPrisonComplexes: 10,
    refugeeProcessingHousing: 10,
  };
  state.resources = {
    ...state.resources,
    credits: 100_000,
    food: 10_000,
    goods: 10_000,
    medSupplies: 10_000,
    steel: 10_000,
    ammo: 10_000,
  };
  return state;
}

function run(
  state: GameState,
  cohort: CohortStewardshipTargetId,
  action: PersonalActionId,
): GameState {
  return applyPersonalInteraction(state, { kind: "cohort", id: cohort }, action);
}

describe("cohort stewardship catalog", () => {
  it("covers every target and all four governing approaches", () => {
    expect(new Set(COHORT_STEWARDSHIP_TARGETS)).toEqual(new Set([
      "homeless",
      "refugees",
      "prisoners",
      "sick",
      "workers",
      "unemployed",
      "elites",
    ]));
    for (const target of COHORT_STEWARDSHIP_TARGETS) {
      expect(getCohortStewardshipActions(target).length).toBeGreaterThan(0);
    }
    expect(new Set(COHORT_STEWARDSHIP_ACTION_ORDER.map((id) => PERSONAL_ACTIONS[id].approach)))
      .toEqual(new Set(["humanitarian", "technocratic", "exploitative", "coercive"]));
  });

  it("reports context requirements and rejects stale execution", () => {
    const state = readyState();
    const target: PersonalInteractionTarget = { kind: "cohort", id: "sick" };
    expect(evaluatePersonalAction("medical-mission", state.resources.credits, {
      target,
      cooldowns: state.personalActionCooldowns,
      history: state.personalActionHistory,
      totalTicks: state.totalTicks,
      state,
    })).toEqual({ eligible: true });

    const stale = {
      ...state,
      resources: { ...state.resources, medSupplies: 0 },
    };
    expect(run(stale, "sick", "medical-mission")).toBe(stale);
    expect(evaluatePersonalAction("medical-mission", stale.resources.credits, {
      target,
      cooldowns: stale.personalActionCooldowns,
      totalTicks: stale.totalTicks,
      state: stale,
    })).toMatchObject({ eligible: false });
  });

  it("uses the canonical cohort-adjusted workforce base", () => {
    const state = readyState();
    const cohorts = computePopulationCohorts(state);
    const workforce = getWorkforceCatalog(state);
    expect(cohorts.workers).toBe(workforce.employedCitizens);
    expect(cohorts.unemployed).toBe(workforce.unemployedCitizens);
    expect(cohorts.workers! + cohorts.unemployed!).toBe(cohorts.workforceCapacity);
  });
});

describe("cohort stewardship outcomes", () => {
  it.each([
    ["humanitarian", "homeless", "shelter-outreach", "housingPressure", -8],
    ["technocratic", "unemployed", "workforce-placement", "employment", 8],
    ["exploitative", "elites", "executive-extraction", "corruption", 8],
    ["coercive", "refugees", "ration-enforcement", "lawOrder", 7],
  ] as const)(
    "applies the %s approach as a multi-field, target-scoped action",
    (approach, cohort, action, stat, delta) => {
      const before = readyState();
      const after = run(before, cohort, action);

      expect(after).not.toBe(before);
      expect(PERSONAL_ACTIONS[action].approach).toBe(approach);
      expect(after.cityStats[stat]).toBe(before.cityStats[stat] + delta);
      expect(Object.keys(after.cohortStewardshipHistory?.at(-1)?.effects ?? {}).length)
        .toBeGreaterThanOrEqual(2);
      expect(after.messages[0]?.title).toContain(PERSONAL_ACTIONS[action].label);
      expect(after.pendingTickEntries?.length ?? 0).toBeGreaterThan(before.pendingTickEntries?.length ?? 0);
    },
  );

  it("applies deterministic faction reactions and isolates cooldowns by cohort", () => {
    const state = readyState();
    const after = run(state, "refugees", "ration-enforcement");
    expect(after).not.toBe(state);
    expect(after.factions.every((faction, index) =>
      faction.loyalty === Math.max(0, state.factions[index].loyalty - 4)
      && faction.threat === Math.min(100, state.factions[index].threat + 5)
    )).toBe(true);

    expect(personalCooldownRemaining(
      after.personalActionCooldowns,
      { kind: "cohort", id: "refugees" },
      "ration-enforcement",
      after.totalTicks,
    )).toBe(PERSONAL_ACTIONS["ration-enforcement"].cooldownTicks);
    expect(personalCooldownRemaining(
      after.personalActionCooldowns,
      { kind: "cohort", id: "prisoners" },
      "ration-enforcement",
      after.totalTicks,
    )).toBe(0);
  });

  it("books coercive backlash exactly once for one successful command", () => {
    const direct = run(readyState(), "refugees", "ration-enforcement");
    const key = "cohort-test:100:refugees:ration-enforcement";
    const once = applyCoerciveBacklash(direct, {
      actionId: "ration-enforcement",
      actionKey: key,
      targetId: "refugees",
      scope: "targeted",
      audience: "cohort",
    });
    const twice = applyCoerciveBacklash(once, {
      actionId: "ration-enforcement",
      actionKey: key,
      targetId: "refugees",
      scope: "targeted",
      audience: "cohort",
    });

    expect((once.coerciveBacklashLog ?? []).filter((entry) => entry === key)).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("survives save migration and drops malformed audit entries", () => {
    const after = run(readyState(), "elites", "executive-extraction");
    const reloaded = sanitizeState(migrateState(JSON.parse(JSON.stringify(after)) as GameState));
    expect(reloaded.cohortStewardshipHistory).toEqual(after.cohortStewardshipHistory);

    const malformed = sanitizeState({
      ...after,
      cohortStewardshipHistory: [
        ...(after.cohortStewardshipHistory ?? []),
        { id: "bad", actionId: "unknown", target: "aliens" },
      ] as GameState["cohortStewardshipHistory"],
    });
    expect(malformed.cohortStewardshipHistory).toEqual(after.cohortStewardshipHistory);
  });

  it("keeps every action's audit through the next simulation tick without promising derived demographic deltas", () => {
    for (const action of COHORT_STEWARDSHIP_ACTION_ORDER) {
      const target = PERSONAL_ACTIONS[action].cohortTargets![0];
      const after = run(readyState(), target, action);
      expect(after).not.toBeNull();
      expect(after.cohortStewardshipHistory?.at(-1)?.effects.demographics).toBeUndefined();
      const ticked = runTick(after).newState;
      expect(ticked.cohortStewardshipHistory?.at(-1)?.actionId).toBe(action);
    }
  });

  it("rejects mismatched action tuples and strips arbitrary audit keys", () => {
    const after = run(readyState(), "elites", "executive-extraction");
    const valid = after.cohortStewardshipHistory![0];
    const cleaned = sanitizeState({
      ...after,
      cohortStewardshipHistory: [
        {
          ...valid,
          approach: "humanitarian",
          target: "homeless",
        },
        {
          ...valid,
          effects: {
            ...valid.effects,
            cityStats: { ...valid.effects.cityStats, injected: 999 } as typeof valid.effects.cityStats,
            resources: { ...valid.effects.resources, injected: 999 } as typeof valid.effects.resources,
          },
          factionReactions: {
            ...valid.factionReactions,
            test: { loyalty: 1, injected: 999 } as { loyalty: number },
          },
        },
      ],
    });

    expect(cleaned.cohortStewardshipHistory).toHaveLength(1);
    const audit = cleaned.cohortStewardshipHistory![0];
    expect(audit.effects.cityStats).not.toHaveProperty("injected");
    expect(audit.effects.resources).not.toHaveProperty("injected");
    expect(audit.factionReactions.test).not.toHaveProperty("injected");
  });

  it("bounds audit labels and pending tick report entries from malformed saves", () => {
    const after = run(readyState(), "elites", "executive-extraction");
    const valid = after.cohortStewardshipHistory![0];
    const cleaned = sanitizeState({
      ...after,
      cohortStewardshipHistory: [{ ...valid, action: "x".repeat(10_000) }],
      pendingTickEntries: [{
        label: "l".repeat(10_000),
        delta: Number.MAX_SAFE_INTEGER,
        unit: "u".repeat(10_000),
        reason: "r".repeat(10_000),
        severity: "invalid",
        injected: "discard me",
      }] as unknown as GameState["pendingTickEntries"],
    });

    expect(cleaned.cohortStewardshipHistory![0].action).toBe("executive-extraction");
    expect(cleaned.pendingTickEntries).toEqual([{
      label: "l".repeat(200),
      delta: 100_000_000_000_000,
      unit: "u".repeat(80),
      reason: "r".repeat(500),
      severity: "neutral",
    }]);
  });
});