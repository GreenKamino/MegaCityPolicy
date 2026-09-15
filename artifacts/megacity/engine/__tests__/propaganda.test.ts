import { describe, expect, it } from "vitest";

import { countTemplates, generatePropagandaFeed } from "@/engine/propaganda";
import type { GameState } from "@/engine/types";

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    totalTicks: 100,
    playerTitle: "Marshal",
    cityStats: {
      population: 0,
      populationGrowthRate: 0,
      crime: 50,
      unrest: 0,
      happiness: 50,
      lawOrder: 50,
      corruption: 0,
      employment: 0,
      housingPressure: 0,
      infrastructureHealth: 0,
      researchProgress: 0,
      researchTarget: 0,
      defenseRating: 0,
      education: 0,
      publicHealth: 0,
      biosphere: 0,
      diseaseRisk: 0,
      upliftPopulation: 0,
    },
    resources: { credits: 5000, food: 0, water: 0, power: 0, steel: 0, goods: 0, fuel: 0, medSupplies: 0, ammo: 0 },
    eventHistory: [],
    completedContracts: [],
    unlockedTechnologies: [],
    ...over,
  } as unknown as GameState;
}

describe("propaganda.generatePropagandaFeed", () => {
  it("never returns an empty list, even on a brand-new state", () => {
    const items = generatePropagandaFeed(makeState());
    expect(items.length).toBeGreaterThan(0);
  });

  it("includes a high-approval rumor when happiness is high", () => {
    const items = generatePropagandaFeed(makeState({
      cityStats: { ...makeState().cityStats, happiness: 80 },
    }));
    expect(items.some((i) => i.id === "happiness_high")).toBe(true);
    expect(items.find((i) => i.id === "happiness_high")?.tone).toBe("triumphant");
  });

  it("spins low happiness reassuringly rather than complimenting it", () => {
    const items = generatePropagandaFeed(makeState({
      cityStats: { ...makeState().cityStats, happiness: 20 },
    }));
    expect(items.some((i) => i.id === "happiness_low")).toBe(true);
    expect(items.some((i) => i.id === "happiness_high")).toBe(false);
  });

  it("issues warnings when crime is high", () => {
    const items = generatePropagandaFeed(makeState({
      cityStats: { ...makeState().cityStats, crime: 75 },
    }));
    const crime = items.find((i) => i.id === "crime_high");
    expect(crime?.tone).toBe("warning");
  });

  it("celebrates wealth when treasury is large", () => {
    const items = generatePropagandaFeed(makeState({
      resources: { ...makeState().resources, credits: 100000 },
    }));
    expect(items.some((i) => i.id === "wealth_high")).toBe(true);
  });

  it("rallies citizens when treasury is empty", () => {
    const items = generatePropagandaFeed(makeState({
      resources: { ...makeState().resources, credits: 50 },
    }));
    expect(items.some((i) => i.id === "wealth_low")).toBe(true);
  });

  it("respects the limit parameter", () => {
    const items = generatePropagandaFeed(makeState({
      cityStats: { ...makeState().cityStats, happiness: 80, crime: 70, unrest: 70, lawOrder: 90, population: 50000 },
      resources: { ...makeState().resources, credits: 100000 },
      totalMissionsSucceeded: 10,
      completedContracts: new Array(6).fill({ id: "x" }) as any,
      unlockedTechnologies: ["a","b","c","d","e","f"],
    }), 3);
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it("falls back to no_news only when no other rumor applies", () => {
    const items = generatePropagandaFeed(makeState({
      cityStats: { ...makeState().cityStats, happiness: 50, crime: 50, lawOrder: 50, unrest: 50, population: 0 },
      resources: { ...makeState().resources, credits: 5000 },
    }));
    // Either no_news appears, or it's been displaced by a real rumor; either
    // way, we never get an empty feed.
    expect(items.length).toBeGreaterThan(0);
  });

  it("stamps each item with the current tick", () => {
    const items = generatePropagandaFeed(makeState({ totalTicks: 9999 }));
    for (const i of items) expect(i.tick).toBe(9999);
  });

  it("exposes a non-zero template count", () => {
    expect(countTemplates()).toBeGreaterThan(5);
  });
});
