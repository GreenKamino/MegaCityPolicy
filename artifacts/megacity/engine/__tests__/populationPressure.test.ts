import { describe, expect, it } from "vitest";

import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
import { computeHousingCapacityBreakdown } from "@/engine/housingCapacity";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { generateOverviewWarnings } from "@/engine/overviewWarnings";
import {
  computePopulationDensityPressure,
  DENSITY_PRESSURE_START_POPULATION,
  MAX_DENSITY_PRESSURE_LEVEL,
} from "@/engine/populationDensity";
import {
  computePopulationPressure,
  getPopulationTier,
  POPULATION_CAPACITY_RESERVE_RATIO,
} from "@/engine/populationPressure";

describe("population pressure", () => {
  it("uses stable, understandable population bands", () => {
    expect(getPopulationTier(999_999).tier.id).toBe("metropolis");
    expect(getPopulationTier(1_000_000).tier.id).toBe("megacity");
    expect(getPopulationTier(1_499_999).tier.id).toBe("megacity");
    expect(getPopulationTier(1_500_000).tier.id).toBe("greater-megacity");
  });

  it("scales raw service targets from one million to one and a half million", () => {
    const oneMillion = createInitialState();
    oneMillion.cityStats.population = 1_000_000;
    oneMillion.rates.foodConsumption = 220;
    oneMillion.rates.waterConsumption = 180;

    const oneAndHalfMillion = {
      ...oneMillion,
      cityStats: { ...oneMillion.cityStats, population: 1_500_000 },
      rates: {
        ...oneMillion.rates,
        foodConsumption: 330,
        waterConsumption: 270,
      },
    };

    const first = computePopulationPressure(oneMillion);
    const second = computePopulationPressure(oneAndHalfMillion);
    const target = (snapshot: typeof first, id: string) =>
      snapshot.metrics.find((item) => item.id === id)!.target;

    for (const id of [
      "food",
      "water",
      "housing",
      "jobs",
      "medical",
      "transit",
      "infrastructure",
      "emergency",
      "security",
      "military",
    ]) {
      expect(target(second, id)).toBeGreaterThan(target(first, id));
    }
    expect(first.reserveRatio).toBe(POPULATION_CAPACITY_RESERVE_RATIO);
  });

  it("shows a large city the exact reserve gap added by a housing build", () => {
    const before = createInitialState();
    before.cityStats.population = 3_000_000;
    before.buildings = {
      habBlockMegaTowers: 180,
      modularHousingFactories: 40,
      emergencyShelterBunkers: 50,
    };
    const after = structuredClone(before);
    after.buildings.modularHousingFactories += 10;

    const beforeHousing = computePopulationPressure(before).metrics.find(
      (item) => item.id === "housing",
    )!;
    const afterHousing = computePopulationPressure(after).metrics.find(
      (item) => item.id === "housing",
    )!;
    const afterBreakdown = computeHousingCapacityBreakdown(after.buildings);

    expect(afterHousing.actual).toBe(afterBreakdown.total);
    expect(afterHousing.target).toBe(beforeHousing.target);
    expect(afterHousing.reserveTarget).toBe(
      afterHousing.target * (1 + POPULATION_CAPACITY_RESERVE_RATIO),
    );
    expect(afterHousing.actual - beforeHousing.actual).toBe(60_000);
    expect(
      Math.max(0, afterHousing.reserveTarget - afterHousing.actual),
    ).toBe(
      Math.max(0, beforeHousing.reserveTarget - beforeHousing.actual) - 60_000,
    );
    expect(afterBreakdown.emergency).toBe(50 * 2_000);
  });

  it("keeps the read-only planning snapshot from mutating health stats", () => {
    const state = createInitialState();
    state.cityStats.crime = 0;
    state.cityStats.unrest = 12;
    state.cityStats.diseaseRisk = 8;
    state.cityStats.population = 1_500_000;

    computePopulationPressure(state);

    expect(state.cityStats.crime).toBe(0);
    expect(state.cityStats.unrest).toBe(12);
    expect(state.cityStats.diseaseRisk).toBe(8);
    expect(CRISIS_THRESHOLDS.crime.trigger).toBe(60);
    expect(CRISIS_THRESHOLDS.unrest.trigger).toBe(70);
    expect(CRISIS_THRESHOLDS.diseaseRisk.trigger).toBe(60);
  });

  it("warns ahead of a tier transition without persisting tier state", () => {
    const state = createInitialState();
    state.cityStats.population = 980_000;

    const snapshot = computePopulationPressure(state);

    expect(snapshot.tier.id).toBe("metropolis");
    expect(snapshot.nextTier?.id).toBe("megacity");
    expect(snapshot.approachingNextTier).toBe(true);
    expect("populationTier" in state).toBe(false);
    expect(
      generateOverviewWarnings(state).some(
        (warning) =>
          warning.id === "population-capacity-metropolis" &&
          warning.label === "GROWTH CAPACITY PLAN",
      ),
    ).toBe(true);
  });

  it("acknowledges a newly crossed tier without persisted milestone state", () => {
    const state = createInitialState();
    state.cityStats.population = 1_000_000;
    state.rates.foodProduction = 10_000;
    state.rates.waterProduction = 10_000;
    state.rates.powerGeneration = 10_000;
    state.rates.foodConsumption = 1;
    state.rates.waterConsumption = 1;
    state.rates.powerDrain = 1;
    state.cityStats.employment = 100;
    state.demographics.emergencyResponseCoverage = 100;
    state.demographics.securityWorkforce = 10_000;

    const snapshot = computePopulationPressure(state);

    expect(snapshot.recentlyEnteredTier).toBe(true);
    expect(
      generateOverviewWarnings(state).some(
        (warning) => warning.id === "population-capacity-megacity",
      ),
    ).toBe(true);
  });

  it("ramps density pressure continuously without a tier-boundary jump", () => {
    const below = computePopulationDensityPressure(999_999);
    const above = computePopulationDensityPressure(1_000_000);

    expect(below.level).toBeGreaterThan(0);
    expect(above.level - below.level).toBeLessThan(0.00001);
    expect(above.crimePerTick).toBeGreaterThan(0);
    expect(above.unrestPerTick).toBeGreaterThan(0);
    expect(above.diseaseRiskPerTick).toBeGreaterThan(0);
    expect(above.publicHealthDrainPerTick).toBeGreaterThan(0);
    expect(above.biosphereDrainPerTick).toBeGreaterThan(0);
  });

  it("starts above the enclave scale and remains bounded at extreme populations", () => {
    expect(
      computePopulationDensityPressure(DENSITY_PRESSURE_START_POPULATION).level,
    ).toBe(0);
    expect(computePopulationDensityPressure(100_000_000_000).level).toBe(
      MAX_DENSITY_PRESSURE_LEVEL,
    );
  });

  it("applies the gradual tradeoff through the real shared tick pipeline", () => {
    const low = createInitialState();
    low.cityStats.population = DENSITY_PRESSURE_START_POPULATION;
    const high = structuredClone(low);
    high.cityStats.population = 3_000_000;

    const lowAfter = runTick(low).newState.cityStats;
    const highAfter = runTick(high).newState.cityStats;

    expect(highAfter.crime - high.cityStats.crime).toBeGreaterThan(
      lowAfter.crime - low.cityStats.crime,
    );
    expect(highAfter.unrest - high.cityStats.unrest).toBeGreaterThan(
      lowAfter.unrest - low.cityStats.unrest,
    );
    expect(highAfter.diseaseRisk - high.cityStats.diseaseRisk).toBeGreaterThan(
      lowAfter.diseaseRisk - low.cityStats.diseaseRisk,
    );
    expect(highAfter.publicHealth - high.cityStats.publicHealth).toBeLessThan(
      lowAfter.publicHealth - low.cityStats.publicHealth,
    );
    expect(highAfter.biosphere - high.cityStats.biosphere).toBeLessThanOrEqual(
      lowAfter.biosphere - low.cityStats.biosphere,
    );
  });

  it("explains both the benefit and cost of growth in overview advisories", () => {
    const state = createInitialState();
    state.cityStats.population = 1_500_000;
    const warning = generateOverviewWarnings(state).find(
      (item) => item.id === "population-density-tradeoff",
    );

    expect(warning?.label).toBe("DENSITY TRADEOFF");
    expect(warning?.detail).toContain("more workers and revenue");
    expect(warning?.detail).toContain("crime, unrest, disease, and pollution");
  });
});