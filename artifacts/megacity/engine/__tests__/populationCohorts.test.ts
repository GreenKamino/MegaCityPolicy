import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import { computeHealthBreakdown } from "@/engine/healthBreakdown";
import { computePopulationCohorts } from "@/engine/populationCohorts";
import { computePopulationPressure } from "@/engine/populationPressure";
import { getWorkforceCatalog } from "@/engine/workforceCatalog";
import type { GameState } from "@/engine/types";
import { admitCustodyGroup } from "@/engine/custody";

describe("population cohorts", () => {
  it("keeps every cohort and derived capacity bounded by the population model", () => {
    const state = createInitialState();
    state.cityStats.population = 1_250_000;
    state.cityStats.diseaseRisk = 100;
    state.demographics.orphanPopulation = 2_000_000;
    state.buildings = {
      megaPrisonComplexes: 100_000,
      refugeeProcessingHousing: 100_000,
    };

    const cohorts = computePopulationCohorts(state);
    for (const key of [
      "homeless",
      "refugees",
      "prisoners",
      "sick",
      "retirees",
      "orphans",
    ] as const) {
      expect(cohorts[key]).toBeGreaterThanOrEqual(0);
      expect(cohorts[key]).toBeLessThanOrEqual(state.cityStats.population);
    }
    expect(cohorts.workforceCapacity).toBeLessThanOrEqual(state.cityStats.population);
    expect(cohorts.housingDemand).toBeLessThanOrEqual(state.cityStats.population * 1.5);
    expect(cohorts.healthServiceDemand).toBeLessThanOrEqual(state.cityStats.population * 2);
    expect(cohorts.unrestPressure).toBeGreaterThanOrEqual(0);
    expect(cohorts.unrestPressure).toBeLessThanOrEqual(100);
  });

  it("backfills a safe derived snapshot when loading a legacy save", () => {
    const state = createInitialState();
    const legacy = { ...state, demographics: { ...state.demographics } } as GameState;
    delete legacy.demographics.populationCohorts;
    const migrated = migrateState(legacy);
    const expected = computePopulationCohorts(migrated);

    expect(migrated.demographics.populationCohorts).toEqual(expected);
    expect(migrated.cityStats.population).toBe(state.cityStats.population);
  });

  it("sanitizes malformed persisted cohort values without letting them escape", () => {
    const state = createInitialState();
    state.demographics.populationCohorts = {
      homeless: -5,
      refugees: Number.NaN,
      prisoners: 99_999_999,
      sick: 1,
      retirees: 2,
      orphans: 3,
      workforceCapacity: 99_999_999,
      housingDemand: 99_999_999,
      healthServiceDemand: 99_999_999,
      unrestPressure: 999,
    };

    const cleaned = sanitizeState(state);
    const cohorts = cleaned.demographics.populationCohorts!;
    expect(cohorts.homeless).toBe(0);
    expect(cohorts.refugees).toBe(0);
    expect(cohorts.prisoners).toBeLessThanOrEqual(cleaned.demographics.totalPopulation);
    expect(cohorts.workforceCapacity).toBeLessThanOrEqual(cleaned.demographics.totalPopulation);
    expect(cohorts.housingDemand).toBeLessThanOrEqual(cleaned.demographics.totalPopulation * 1.5);
    expect(cohorts.healthServiceDemand).toBeLessThanOrEqual(cleaned.demographics.totalPopulation * 2);
    expect(cohorts.unrestPressure).toBe(100);
  });

  it("uses the same cohorts for workforce, housing pressure, health, and unrest load", () => {
    const burdened = createInitialState();
    burdened.cityStats.population = 5_000_000;
    burdened.cityStats.diseaseRisk = 100;
    burdened.demographics.orphanPopulation = 500_000;
    burdened.buildings = {};

    const sheltered = createInitialState();
    sheltered.cityStats.population = burdened.cityStats.population;
    sheltered.cityStats.diseaseRisk = 0;
    sheltered.demographics.orphanPopulation = 0;
    sheltered.buildings = { emergencyShelterBunkers: 1_000_000 };

    const burdenedCohorts = computePopulationCohorts(burdened);
    const shelteredCohorts = computePopulationCohorts(sheltered);
    expect(burdenedCohorts.workforceCapacity).toBeLessThan(shelteredCohorts.workforceCapacity);
    expect(burdenedCohorts.housingDemand).toBeGreaterThan(shelteredCohorts.housingDemand);
    expect(burdenedCohorts.healthServiceDemand).toBeGreaterThan(shelteredCohorts.healthServiceDemand);
    expect(burdenedCohorts.unrestPressure).toBeGreaterThan(shelteredCohorts.unrestPressure);

    expect(getWorkforceCatalog(burdened).employedCitizens).toBeLessThan(
      getWorkforceCatalog(sheltered).employedCitizens,
    );
    expect(
      computePopulationPressure(burdened).metrics.find((m) => m.id === "housing")!.target,
    ).toBeGreaterThan(
      computePopulationPressure(sheltered).metrics.find((m) => m.id === "housing")!.target,
    );
    expect(
      computeHealthBreakdown(burdened).negatives.some((item) => item.label === "Cohort care load"),
    ).toBe(true);
  });

  it("uses custody occupancy rather than prison building capacity", () => {
    const state = createInitialState();
    state.custody = undefined;
    state.cityStats.population = 1_000;
    state.buildings.megaPrisonComplexes = 10;
    expect(computePopulationCohorts(state).prisoners).toBe(0);

    admitCustodyGroup(state, "detention-1", {
      id: "civilian-detainees",
      count: 120,
      role: "civilian",
      legalStatus: "sentenced",
      originKind: "unknown",
      originId: null,
      originLabel: "Not applicable",
    });
    expect(computePopulationCohorts(state).prisoners).toBe(120);
    expect(computePopulationCohorts(state).workforceCapacity).toBeLessThan(1_000);
  });
});