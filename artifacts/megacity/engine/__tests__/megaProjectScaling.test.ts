import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  getMegaProjectCostScale,
  getScaledPlanningCost,
  getScaledConstructionCost,
  getScaledSteelCost,
} from "@/engine/megaProjects";
import type { MegaProjectDef } from "@/engine/megaProjects";

const def = {
  id: "spaceport" as any,
  name: "Test Project",
  description: "test",
  icon: "rocket",
  flavorText: "test",
  requirements: { minPopulation: 0, minCredits: 0, minSteel: 0 },
  planningCost: 10_000,
  constructionCost: 100_000,
  steelCost: 5_000,
  ticksToComplete: 100,
  workforceRequired: 100,
  completionEffects: { label: "test", description: "test" },
} as unknown as MegaProjectDef;

describe("getMegaProjectCostScale", () => {
  it("returns 1x at small populations", () => {
    const s = createInitialState();
    s.cityStats!.population = 50_000;
    expect(getMegaProjectCostScale(s)).toBe(1);
  });

  it("returns 1x exactly at the 200k threshold", () => {
    const s = createInitialState();
    s.cityStats!.population = 200_000;
    expect(getMegaProjectCostScale(s)).toBe(1);
  });

  it("scales up smoothly with population growth", () => {
    const s = createInitialState();
    s.cityStats!.population = 800_000;
    const scale = getMegaProjectCostScale(s);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeCloseTo(2, 1);
  });

  it("caps at 2.5x for huge populations", () => {
    const s = createInitialState();
    s.cityStats!.population = 5_000_000;
    expect(getMegaProjectCostScale(s)).toBe(2.5);
  });

  it("handles missing cityStats safely", () => {
    const s = createInitialState();
    s.cityStats = undefined as any;
    expect(getMegaProjectCostScale(s)).toBe(1);
  });
});

describe("scaled cost helpers", () => {
  it("scaled planning cost matches scale x base", () => {
    const s = createInitialState();
    s.cityStats!.population = 800_000;
    const scale = getMegaProjectCostScale(s);
    expect(getScaledPlanningCost(s, def)).toBe(Math.round(def.planningCost * scale));
  });

  it("scaled construction cost matches scale x base", () => {
    const s = createInitialState();
    s.cityStats!.population = 800_000;
    const scale = getMegaProjectCostScale(s);
    expect(getScaledConstructionCost(s, def)).toBe(Math.round(def.constructionCost * scale));
  });

  it("steel cost scales gentler than credits cost", () => {
    const s = createInitialState();
    s.cityStats!.population = 5_000_000; // hits 2.5x cap
    const planning = getScaledPlanningCost(s, def);
    const steel = getScaledSteelCost(s, def);
    const planningRatio = planning / def.planningCost;
    const steelRatio = steel / def.steelCost;
    expect(steelRatio).toBeLessThan(planningRatio);
    expect(steelRatio).toBeCloseTo(1.75, 2); // 1 + (2.5-1)*0.5 = 1.75
  });
});
