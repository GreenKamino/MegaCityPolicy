// Coverage for the Steam-release Run Summary additions:
//   1. stateOfCity     — narrative + headline derivation across condition tiers
//   2. archetype       — dominant-axis selection from career signals
//   3. milestoneTimeline — top-severity event picks in chronological order
//
// All tests construct minimal fake GameState objects and call buildRunSummary
// directly. Pure derivation — no IO, no engine ticking required.

import { describe, it, expect } from "vitest";
import { buildRunSummary } from "@/engine/runSummary";
import { buildRunSummaryText } from "@/engine/runSummaryText";
import type { GameState } from "@/engine/types";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    totalTicks: 100,
    cityName: "TEST SECTOR",
    cityStats: {
      population: 5000,
      happiness: 50,
      lawOrder: 50,
      crime: 20,
      unrest: 20,
      corruption: 20,
      publicHealth: 50,
      education: 50,
      biosphere: 50,
      employment: 50,
      infrastructureHealth: 50,
      defenseRating: 50,
      populationGrowthRate: 0,
    },
    demographics: {},
    rates: {
      foodProduction: 100,
      foodConsumption: 100,
      waterProduction: 100,
      waterConsumption: 100,
      powerGeneration: 100,
      powerDrain: 100,
      goodsProduction: 100,
      goodsConsumption: 100,
      taxIncome: 0,
      tradeIncome: 0,
      tourismIncome: 0,
    },
    resources: {
      credits: 1000,
      food: 1000,
      water: 1000,
      power: 1000,
      steel: 0,
      goods: 0,
      fuel: 0,
      medSupplies: 0,
      ammo: 0,
    },
    buildings: {},
    units: {},
    districts: [],
    factions: [],
    eventHistory: [],
    ...overrides,
  } as unknown as GameState;
}

describe("RunSummary :: stateOfCity narrative", () => {
  it("emits FRESH ASSIGNMENT for the very opening ticks", () => {
    const r = buildRunSummary(baseState({ totalTicks: 2 }));
    expect(r.stateOfCity.headline).toBe("FRESH ASSIGNMENT");
    expect(r.stateOfCity.narrative.length).toBeGreaterThan(20);
  });

  it("flags STARVING when food is in deep deficit and stockpile is low", () => {
    const r = buildRunSummary(
      baseState({
        rates: {
          foodProduction: 10,
          foodConsumption: 200,
          waterProduction: 100,
          waterConsumption: 100,
          powerGeneration: 100,
          powerDrain: 100,
          goodsProduction: 100,
          goodsConsumption: 100,
        } as GameState["rates"],
        resources: {
          credits: 1000, food: 50, water: 1000, power: 1000,
          steel: 0, goods: 0, fuel: 0, medSupplies: 0, ammo: 0,
        },
      }),
    );
    expect(r.stateOfCity.headline).toBe("STARVING");
  });

  it("flags PARCHED when water is in deficit and stockpile is low", () => {
    const r = buildRunSummary(
      baseState({
        rates: {
          foodProduction: 100, foodConsumption: 100,
          waterProduction: 10, waterConsumption: 200,
          powerGeneration: 100, powerDrain: 100,
          goodsProduction: 100, goodsConsumption: 100,
        } as GameState["rates"],
        resources: {
          credits: 1000, food: 1000, water: 50, power: 1000,
          steel: 0, goods: 0, fuel: 0, medSupplies: 0, ammo: 0,
        },
      }),
    );
    expect(r.stateOfCity.headline).toBe("PARCHED");
  });

  it("flags DARK SECTOR on power deficit + drained stockpile", () => {
    const r = buildRunSummary(
      baseState({
        rates: {
          foodProduction: 100, foodConsumption: 100,
          waterProduction: 100, waterConsumption: 100,
          powerGeneration: 10, powerDrain: 100,
          goodsProduction: 100, goodsConsumption: 100,
        } as GameState["rates"],
        resources: {
          credits: 1000, food: 1000, water: 1000, power: 20,
          steel: 0, goods: 0, fuel: 0, medSupplies: 0, ammo: 0,
        },
      }),
    );
    expect(r.stateOfCity.headline).toBe("DARK SECTOR");
  });

  it("flags RIOTING when unrest or crime crosses threshold", () => {
    const r = buildRunSummary(
      baseState({
        cityStats: {
          population: 5000, happiness: 50, lawOrder: 50, crime: 20,
          unrest: 80, corruption: 20, publicHealth: 50, education: 50,
          biosphere: 50, employment: 50, infrastructureHealth: 50,
          defenseRating: 50, populationGrowthRate: 0,
        } as GameState["cityStats"],
      }),
    );
    expect(r.stateOfCity.headline).toBe("RIOTING");
  });

  it("flags PLAGUE-RIDDEN when public health collapses", () => {
    const r = buildRunSummary(
      baseState({
        cityStats: {
          population: 5000, happiness: 50, lawOrder: 50, crime: 20,
          unrest: 20, corruption: 20, publicHealth: 15, education: 50,
          biosphere: 50, employment: 50, infrastructureHealth: 50,
          defenseRating: 50, populationGrowthRate: 0,
        } as GameState["cityStats"],
      }),
    );
    expect(r.stateOfCity.headline).toBe("PLAGUE-RIDDEN");
  });

  it("flags LAWLESS when law/order falls through the floor", () => {
    const r = buildRunSummary(
      baseState({
        cityStats: {
          population: 5000, happiness: 50, lawOrder: 10, crime: 20,
          unrest: 20, corruption: 20, publicHealth: 50, education: 50,
          biosphere: 50, employment: 50, infrastructureHealth: 50,
          defenseRating: 50, populationGrowthRate: 0,
        } as GameState["cityStats"],
      }),
    );
    expect(r.stateOfCity.headline).toBe("LAWLESS");
  });

  it("flags BOOMING when happiness, law/order are high and unrest is low", () => {
    const r = buildRunSummary(
      baseState({
        cityStats: {
          population: 5000, happiness: 85, lawOrder: 75, crime: 10,
          unrest: 10, corruption: 10, publicHealth: 60, education: 60,
          biosphere: 60, employment: 60, infrastructureHealth: 60,
          defenseRating: 60, populationGrowthRate: 5,
        } as GameState["cityStats"],
      }),
    );
    expect(r.stateOfCity.headline).toBe("BOOMING");
  });

  it("flags STABLE for healthy mid-range runs", () => {
    const r = buildRunSummary(
      baseState({
        cityStats: {
          population: 5000, happiness: 60, lawOrder: 50, crime: 20,
          unrest: 30, corruption: 20, publicHealth: 50, education: 50,
          biosphere: 50, employment: 50, infrastructureHealth: 50,
          defenseRating: 50, populationGrowthRate: 1,
        } as GameState["cityStats"],
      }),
    );
    expect(r.stateOfCity.headline).toBe("STABLE");
  });

  it("falls back to SURVIVING when nothing dominates", () => {
    const r = buildRunSummary(baseState());
    expect(["SURVIVING", "STABLE"]).toContain(r.stateOfCity.headline);
  });
});

describe("RunSummary :: archetype", () => {
  it("returns SURVIVOR when no axis crosses the floor", () => {
    // Truly empty fixture — zero out the qol/order stats so no archetype
    // (including humanist, which feeds off happiness + publicHealth) clears
    // the 25-point dominance floor.
    const r = buildRunSummary(
      baseState({
        totalTicks: 5,
        cityStats: {
          population: 5000, happiness: 0, lawOrder: 0, crime: 0,
          unrest: 0, corruption: 0, publicHealth: 0, education: 0,
          biosphere: 0, employment: 0, infrastructureHealth: 0,
          defenseRating: 0, populationGrowthRate: 0,
        } as GameState["cityStats"],
        demographics: {} as GameState["demographics"],
      }),
    );
    expect(r.archetype.id).toBe("survivor");
    expect(r.archetype.name).toBe("SURVIVOR");
  });

  it("crowns WARLORD when units and strikes dominate", () => {
    const units: Record<string, number> = {};
    for (let i = 0; i < 50; i++) units[`unit_${i}`] = 10;
    const r = buildRunSummary(
      baseState({
        units,
        strikeHistory: Array(20).fill({ success: true }) as GameState["strikeHistory"],
        cityStats: {
          population: 5000, happiness: 50, lawOrder: 50, crime: 20,
          unrest: 20, corruption: 20, publicHealth: 50, education: 50,
          biosphere: 50, employment: 50, infrastructureHealth: 50,
          defenseRating: 100, populationGrowthRate: 0,
        } as GameState["cityStats"],
      }),
    );
    expect(r.archetype.id).toBe("warlord");
  });

  it("crowns TECHNOCRAT when research dominates", () => {
    const r = buildRunSummary(
      baseState({
        unlockedTechnologies: Array(80).fill("tech_x") as string[],
      }),
    );
    expect(r.archetype.id).toBe("scientist");
    expect(r.archetype.name).toBe("TECHNOCRAT");
  });

  it("crowns TRADER when trade pacts and contracts dominate", () => {
    const r = buildRunSummary(
      baseState({
        tradeAgreements: Array(15).fill({ id: "x" }) as GameState["tradeAgreements"],
        completedContracts: Array(40).fill({ id: "x" }) as GameState["completedContracts"],
        townships: Array(20).fill({ id: "x" }) as GameState["townships"],
      }),
    );
    expect(r.archetype.id).toBe("trader");
  });

  it("every archetype carries a tagline string", () => {
    const r = buildRunSummary(baseState());
    expect(r.archetype.tagline.length).toBeGreaterThan(10);
  });
});

describe("RunSummary :: milestoneTimeline", () => {
  it("returns an empty timeline when no events are in history", () => {
    const r = buildRunSummary(baseState());
    expect(r.milestoneTimeline).toEqual([]);
  });

  it("caps the timeline at 8 entries even with a flood of events", () => {
    const eventHistory = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`,
      title: `Event ${i}`,
      description: `Desc ${i}`,
      severity: "high" as const,
      effects: {},
      timestamp: i,
      resolved: true,
    }));
    const r = buildRunSummary(baseState({ eventHistory } as Partial<GameState>));
    expect(r.milestoneTimeline.length).toBe(8);
  });

  it("prefers higher-severity events over lower ones", () => {
    const eventHistory = [
      { id: "a", title: "Low Thing",      description: "", severity: "low",      effects: {}, timestamp: 1, resolved: true },
      { id: "b", title: "Critical Event", description: "", severity: "critical", effects: {}, timestamp: 2, resolved: true },
      { id: "c", title: "Medium Thing",   description: "", severity: "medium",   effects: {}, timestamp: 3, resolved: true },
      { id: "d", title: "High Thing",     description: "", severity: "high",     effects: {}, timestamp: 4, resolved: true },
    ];
    const r = buildRunSummary(
      baseState({ eventHistory: eventHistory as GameState["eventHistory"] }),
    );
    const labels = r.milestoneTimeline.map((m) => m.label);
    // Critical, High, and Medium should outrank Low.
    expect(labels).toContain("Critical Event");
    expect(labels).toContain("High Thing");
  });

  it("emits chronological slot numbers starting at 1", () => {
    const eventHistory = [
      { id: "a", title: "First",  description: "", severity: "high", effects: {}, timestamp: 1, resolved: true },
      { id: "b", title: "Second", description: "", severity: "high", effects: {}, timestamp: 2, resolved: true },
      { id: "c", title: "Third",  description: "", severity: "high", effects: {}, timestamp: 3, resolved: true },
    ];
    const r = buildRunSummary(
      baseState({ eventHistory: eventHistory as GameState["eventHistory"] }),
    );
    expect(r.milestoneTimeline.map((m) => m.slot)).toEqual([1, 2, 3]);
    expect(r.milestoneTimeline.map((m) => m.label)).toEqual(["First", "Second", "Third"]);
  });
});

// Defensive coverage requested by architect review: ensure derivations don't
// throw or emit garbage when upstream stats arrive as NaN (which can happen
// briefly during save migrations or division-by-zero edge cases).
describe("RunSummary :: NaN resilience", () => {
  it("survives NaN-poisoned cityStats without throwing or emitting NaN labels", () => {
    const r = buildRunSummary(
      baseState({
        cityStats: {
          population: 5000,
          happiness: NaN,
          lawOrder: NaN,
          crime: NaN,
          unrest: NaN,
          corruption: NaN,
          publicHealth: NaN,
          education: NaN,
          biosphere: NaN,
          employment: NaN,
          infrastructureHealth: NaN,
          defenseRating: NaN,
          populationGrowthRate: NaN,
        } as GameState["cityStats"],
      }),
    );
    // Headlines / archetype names must be plain strings, never literal "NaN".
    expect(typeof r.stateOfCity.headline).toBe("string");
    expect(r.stateOfCity.headline).not.toMatch(/NaN/);
    expect(typeof r.archetype.name).toBe("string");
    expect(r.archetype.name).not.toMatch(/NaN/);
    // Narrative copy should still read as a sentence, not as broken arithmetic.
    expect(r.stateOfCity.narrative.length).toBeGreaterThan(20);
    expect(r.stateOfCity.narrative).not.toMatch(/NaN/);
  });

  it("survives NaN-poisoned rates and resources", () => {
    expect(() =>
      buildRunSummary(
        baseState({
          rates: {
            foodProduction: NaN,
            foodConsumption: NaN,
            waterProduction: NaN,
            waterConsumption: NaN,
            powerGeneration: NaN,
            powerDrain: NaN,
            goodsProduction: NaN,
            goodsConsumption: NaN,
            taxIncome: NaN,
            tradeIncome: NaN,
            tourismIncome: NaN,
          } as GameState["rates"],
          resources: {
            credits: NaN,
            food: NaN,
            water: NaN,
            power: NaN,
            steel: NaN,
            goods: NaN,
            fuel: NaN,
            medSupplies: NaN,
            ammo: NaN,
          } as GameState["resources"],
        }),
      ),
    ).not.toThrow();
  });
});

// Exporter coverage requested by architect review: confirm the new sections
// appear in the clipboard text in the right order with the right shape.
describe("RunSummaryText :: new sections render", () => {
  it("includes STATE OF THE CITY, RUN ARCHETYPE, and MILESTONE TIMELINE blocks", () => {
    const eventHistory = [
      { id: "e1", title: "Aqueduct Collapse", description: "", severity: "critical", effects: {}, timestamp: 100, resolved: true },
      { id: "e2", title: "Sector Riot",       description: "", severity: "high",     effects: {}, timestamp: 200, resolved: true },
    ];
    const summary = buildRunSummary(
      baseState({
        totalTicks: 250,
        eventHistory: eventHistory as GameState["eventHistory"],
        commanderOrigin: "wasteland_scout",
      }),
    );
    const text = buildRunSummaryText(summary);

    // All three new section headers present.
    expect(text).toContain("// STATE OF THE CITY");
    expect(text).toContain("// RUN ARCHETYPE");
    expect(text).toContain("// MILESTONE TIMELINE");

    // Section ordering: STATE OF THE CITY → RUN ARCHETYPE come near the top
    // (before the existing POPULATION block); MILESTONE TIMELINE comes after
    // the existing MILESTONES block.
    const idxState     = text.indexOf("// STATE OF THE CITY");
    const idxArchetype = text.indexOf("// RUN ARCHETYPE");
    const idxPopulation = text.indexOf("// POPULATION");
    const idxMilestones = text.indexOf("// MILESTONES");
    const idxTimeline   = text.indexOf("// MILESTONE TIMELINE");
    expect(idxState).toBeLessThan(idxArchetype);
    expect(idxArchetype).toBeLessThan(idxPopulation);
    expect(idxMilestones).toBeLessThan(idxTimeline);

    // Content shape: bracketed headline, em-dash tagline, picked event titles.
    expect(text).toMatch(/\[[A-Z][A-Z _-]+\]/); // stateOfCity bracketed headline
    expect(text).toContain(`${summary.archetype.name} — ${summary.archetype.tagline}`);
    expect(text).toContain("Aqueduct Collapse");
    expect(text).toContain("Sector Riot");
    expect(text).toContain("Origin: WASTELAND SCOUT");
  });

  it("omits the MILESTONE TIMELINE block when no events qualify", () => {
    const text = buildRunSummaryText(buildRunSummary(baseState({ eventHistory: [] })));
    expect(text).not.toContain("// MILESTONE TIMELINE");
    // The other two new blocks should still render.
    expect(text).toContain("// STATE OF THE CITY");
    expect(text).toContain("// RUN ARCHETYPE");
  });
});
