import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  generateOverviewWarnings,
  getOverviewWarningAction,
} from "@/engine/overviewWarnings";

describe("overview warning actions", () => {
  it("adds safe destinations to every supported warning family", () => {
    const state = createInitialState();
    state.resources.food = 0;
    state.resources.water = 0;
    state.resources.credits = 0;
    state.rates.powerGeneration = 0;
    state.rates.powerDrain = 201;
    state.cityStats.crime = 90;
    state.cityStats.unrest = 90;
    state.cityStats.happiness = 10;
    state.cityStats.corruption = 90;
    state.cityStats.housingPressure = 90;
    state.cityStats.defenseRating = 10;
    state.cityStats.employment = 20;
    state.cityStats.infrastructureHealth = 20;
    state.cityStats.biosphere = 10;
    state.cityStats.diseaseRisk = 80;
    state.cityStats.population = 1_500_000;

    const warnings = new Map(generateOverviewWarnings(state).map((warning) => [warning.id, warning]));
    const expected = {
      "food-crit": ["OPEN FOOD BUILD", "construction", "food"],
      "water-crit": ["OPEN WATER BUILD", "construction", "water"],
      "power-crit": ["OPEN ENERGY BUILD", "construction", "energy"],
      "crime-crit": ["OPEN LAW", "law"],
      "unrest-crit": ["OPEN LAW", "law"],
      "happy-crit": ["OPEN ECONOMY", "economy"],
      "corrupt-crit": ["OPEN LAW", "law"],
      "credits-crit": ["OPEN ECONOMY", "economy"],
      "housing-crit": ["OPEN HOUSING BUILD", "construction", "housing"],
      "defense-warn": ["OPEN MILITARY", "military"],
      "employ-warn": ["OPEN ECONOMY", "economy"],
      "infra-warn": ["OPEN INFRA BUILD", "construction", "infrastructure"],
      "biosphere-crit": ["OPEN WILDLANDS", "wildlands"],
      "disease-crit": ["OPEN HEALTH BUILD", "construction", "civic"],
      "population-density-tradeoff": ["OPEN DISTRICTS", "districts"],
    } as const;

    for (const [id, [label, screen, category]] of Object.entries(expected)) {
      const action = warnings.get(id)?.action;
      expect(action?.label, id).toBe(label);
      expect(action?.target.screen, id).toBe(screen);
      if (screen === "construction") {
        expect(action?.target).toMatchObject({ category });
      }
    }

    const capacityWarning = [...warnings.values()].find((warning) =>
      warning.id.startsWith("population-capacity-"),
    );
    expect(capacityWarning?.action?.target).toMatchObject({
      screen: "construction",
      category: "housing",
    });
  });

  it("leaves unknown warning ids without a misleading destination", () => {
    expect(getOverviewWarningAction("future-warning")).toBeUndefined();
  });

  it("keeps routine full material stores out of the persistent City advisories", () => {
    const state = createInitialState();
    state.resources.steel = 1_000;
    state.resources.goods = 1_000;

    expect(generateOverviewWarnings(state).map((warning) => warning.id))
      .not.toContain("material-storage-full");
  });
});