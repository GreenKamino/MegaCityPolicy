import { describe, expect, it } from "vitest";

import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
import { computeCrimeBreakdown } from "@/engine/crimeBreakdown";
import { CONDITION_TRIGGERS } from "@/engine/eventTriggers";
import { createInitialState } from "@/engine/initialState";
import { computeInfrastructureBreakdown } from "@/engine/infrastructureBreakdown";
import { computePowerBreakdown } from "@/engine/powerBreakdown";
import type { GameState } from "@/engine/types";

function trigger(id: string) {
  const found = CONDITION_TRIGGERS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing core crisis trigger: ${id}`);
  return found;
}

describe("core crisis thresholds", () => {
  it("makes each core event trigger fire at the shared boundary", () => {
    // This deliberately checks event behavior, rather than merely comparing
    // numeric literals. A future trigger edit cannot quietly leave the shared
    // hint value behind.
    const checks: Array<[string, (s: GameState) => void]> = [
      ["crime_wave_surge", (s) => { s.cityStats.crime = CRISIS_THRESHOLDS.crime.trigger; }],
      ["food_crisis", (s) => { s.resources.food = CRISIS_THRESHOLDS.food.trigger; }],
      ["power_crisis", (s) => { s.resources.power = CRISIS_THRESHOLDS.power.trigger; }],
      ["unrest_boiling", (s) => { s.cityStats.unrest = CRISIS_THRESHOLDS.unrest.trigger; }],
      ["health_emergency", (s) => { s.cityStats.diseaseRisk = CRISIS_THRESHOLDS.diseaseRisk.trigger; }],
      ["corruption_endemic", (s) => { s.cityStats.corruption = CRISIS_THRESHOLDS.corruption.trigger; }],
      ["infrastructure_decay", (s) => { s.cityStats.infrastructureHealth = CRISIS_THRESHOLDS.infrastructureHealth.trigger; }],
    ];

    for (const [id, set] of checks) {
      const state = createInitialState();
      set(state);
      expect(trigger(id).check(state), `${id} did not fire at its shared threshold`).toBe(true);
    }
  });

  it("does not fire the event one whole point before its boundary", () => {
    const checks: Array<[string, (s: GameState, value: number) => void, number]> = [
      ["crime_wave_surge", (s, value) => { s.cityStats.crime = value; }, CRISIS_THRESHOLDS.crime.trigger - 1],
      ["food_crisis", (s, value) => { s.resources.food = value; }, CRISIS_THRESHOLDS.food.trigger + 1],
      ["power_crisis", (s, value) => { s.resources.power = value; }, CRISIS_THRESHOLDS.power.trigger + 1],
      ["unrest_boiling", (s, value) => { s.cityStats.unrest = value; }, CRISIS_THRESHOLDS.unrest.trigger - 1],
      ["health_emergency", (s, value) => { s.cityStats.diseaseRisk = value; }, CRISIS_THRESHOLDS.diseaseRisk.trigger - 1],
      ["corruption_endemic", (s, value) => { s.cityStats.corruption = value; }, CRISIS_THRESHOLDS.corruption.trigger - 1],
      ["infrastructure_decay", (s, value) => { s.cityStats.infrastructureHealth = value; }, CRISIS_THRESHOLDS.infrastructureHealth.trigger + 1],
    ];

    for (const [id, set, safeValue] of checks) {
      const state = createInitialState();
      set(state, safeValue);
      expect(trigger(id).check(state), `${id} fired before its shared threshold`).toBe(false);
    }
  });
});

describe("recovery hints share their matching crisis boundary", () => {
  it("shows crime recovery advice at the crime-wave boundary, not before", () => {
    const makeState = (crime: number) => {
      const state = createInitialState();
      state.cityStats = {
        ...state.cityStats,
        crime,
        unrest: 10,
        happiness: 80,
        diseaseRisk: 10,
        biosphere: 70,
      };
      state.resources = { ...state.resources, food: 5000 };
      state.buildings = {};
      state.units = {};
      state.activeMiningPolicies = [];
      return state;
    };

    expect(computeCrimeBreakdown(makeState(CRISIS_THRESHOLDS.crime.trigger - 1)).suggestions).toHaveLength(0);
    expect(computeCrimeBreakdown(makeState(CRISIS_THRESHOLDS.crime.trigger)).suggestions.length).toBeGreaterThan(0);
  });

  it("shows power recovery advice at the power-crisis boundary, not before", () => {
    const makeState = (power: number) => {
      const state = createInitialState();
      state.resources.power = power;
      state.buildings = { fusionReactors: 1 };
      state.units = {};
      return state;
    };

    expect(computePowerBreakdown(makeState(CRISIS_THRESHOLDS.power.trigger + 1)).suggestions).toHaveLength(0);
    expect(computePowerBreakdown(makeState(CRISIS_THRESHOLDS.power.trigger)).suggestions.length).toBeGreaterThan(0);
  });

  it("shows infrastructure recovery advice at the decay boundary, not before", () => {
    const makeState = (infrastructureHealth: number) => {
      const state = createInitialState();
      state.units = {};
      state.resources = { ...state.resources, credits: 0, steel: 0, power: 100 };
      state.cityStats = { ...state.cityStats, infrastructureHealth, unrest: 10 };
      return state;
    };

    expect(
      computeInfrastructureBreakdown(
        makeState(CRISIS_THRESHOLDS.infrastructureHealth.trigger + 1),
      ).suggestions,
    ).toHaveLength(0);
    expect(
      computeInfrastructureBreakdown(
        makeState(CRISIS_THRESHOLDS.infrastructureHealth.trigger),
      ).suggestions.length,
    ).toBeGreaterThan(0);
  });
});