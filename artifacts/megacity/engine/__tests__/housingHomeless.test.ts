import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { RESIDENTIAL_DISTRICT_BASE_CAPACITY } from "@/engine/districts";
import { computeHousingCapacityBreakdown } from "@/engine/housingCapacity";

// Regression coverage for the "everyone eventually becomes homeless" bug.
// The homeless count must be the real shelter shortfall
// (max(0, population - housingCapacity)), NOT a share of the smoothed
// housingPressure signal (which saturated at 100 and flagged the whole city
// homeless no matter how much housing was built).

describe("homeless population — real shortfall, not saturated pressure", () => {
  it("keeps permanent and emergency capacity in one authoritative breakdown", () => {
    const breakdown = computeHousingCapacityBreakdown({
      habBlockMegaTowers: 2,
      modularHousingFactories: 5,
      emergencyShelterBunkers: 3,
      undergroundShelterNetworks: 4,
    });

    expect(breakdown.baseline).toBe(RESIDENTIAL_DISTRICT_BASE_CAPACITY);
    expect(breakdown.permanent).toBe(2 * 8_000 + 5 * 6_000);
    expect(breakdown.emergency).toBe(3 * 2_000 + 4 * 3_000);
    expect(breakdown.total).toBe(
      RESIDENTIAL_DISTRICT_BASE_CAPACITY + breakdown.permanent + breakdown.emergency,
    );
    expect(
      breakdown.contributions.find((entry) => entry.key === "modularHousingFactories"),
    ).toMatchObject({
      kind: "permanent",
      perBuilding: 6_000,
      count: 5,
      capacity: 30_000,
    });
    expect(
      breakdown.contributions.find((entry) => entry.key === "emergencyShelterBunkers"),
    ).toMatchObject({
      kind: "emergency",
      perBuilding: 2_000,
      count: 3,
      capacity: 6_000,
    });
  });

  it("drives homelessness to zero when housing capacity exceeds population", () => {
    const state = createInitialState();
    // One building type at an enormous count → capacity dwarfs any population.
    state.buildings = { emergencyShelterBunkers: 1_000_000 } as Record<string, number>;
    state.cityStats.population = RESIDENTIAL_DISTRICT_BASE_CAPACITY + 250_000;

    const { newState } = runTick(state);

    expect(newState.demographics.homelessPopulation).toBe(0);
    // The pressure signal stays bounded regardless.
    expect(newState.cityStats.housingPressure).toBeGreaterThanOrEqual(0);
    expect(newState.cityStats.housingPressure).toBeLessThanOrEqual(100);
  });

  it("counts homeless as the exact capacity shortfall when housing is short", () => {
    const state = createInitialState();
    // No built housing → capacity is exactly the residential-district base.
    state.buildings = {} as Record<string, number>;
    state.cityStats.population = RESIDENTIAL_DISTRICT_BASE_CAPACITY + 50_000;

    const { newState } = runTick(state);

    const finalPop = newState.cityStats.population;
    const expected = Math.max(0, finalPop - RESIDENTIAL_DISTRICT_BASE_CAPACITY);
    expect(newState.demographics.homelessPopulation).toBe(expected);
    expect(newState.demographics.homelessPopulation).toBeGreaterThan(0);
    // Not the old saturated behaviour: homeless is far below the full population.
    expect(newState.demographics.homelessPopulation).toBeLessThan(finalPop);
  });

  it("relieves housing pressure over time as capacity is added, keeping homeless at zero", () => {
    const state = createInitialState();
    state.buildings = { emergencyShelterBunkers: 1_000_000 } as Record<string, number>;
    state.cityStats.population = RESIDENTIAL_DISTRICT_BASE_CAPACITY + 100_000;
    state.cityStats.housingPressure = 90;

    let s = state;
    for (let i = 0; i < 60; i++) s = runTick(s).newState;

    expect(s.cityStats.housingPressure).toBeLessThan(90);
    expect(s.cityStats.housingPressure).toBeGreaterThanOrEqual(0);
    expect(s.demographics.homelessPopulation).toBe(0);
  });
});
