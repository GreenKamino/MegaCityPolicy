import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import {
  computeTransitBreakdown,
  computeTransitCapacity,
  computeTransitLoad,
  TRANSIT_CAPACITY_BUILDING_WEIGHTS,
  TRANSIT_CAPACITY_UNIT_WEIGHTS,
  TRANSIT_LOAD_BUILDING_WEIGHTS,
  TRANSIT_POP_PER_LOAD_POINT,
  TRANSIT_OVERLOAD_HAPPINESS_PENALTY,
  TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY,
  TRANSIT_WARN_LOAD_RATIO,
  type TransitSuggestionTarget,
} from "@/engine/transitBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToTransitSuggestion } from "@/utils/transitNavigation";
import { router } from "expo-router";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

// ─────────────────────────────────────────────────────────────────────────────
// Transit breakdown — the "diagnose -> one-tap fix" card for the transit grid,
// mirroring the power / water pattern. Transit is capacity-vs-demand: the sim
// silently drains Happiness (-1) and Employment (-0.5) every tick while load
// exceeds capacity, and until this card there was NO surface showing it.
// These tests prove:
//   1. the readout's capacity/load weights mirror the sim exactly,
//   2. the task's reported invisible overload (240 load vs 80 capacity) is
//      fully decomposed into named sources,
//   3. the card warns before the penalty starts (90% load), and
//   4. every deep-link resolves to a real screen / construction category.
// ─────────────────────────────────────────────────────────────────────────────

const engineSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

// A clean slate with an empty grid, so each test opts in to exactly the
// capacity and load it means to exercise.
function baseState(): GameState {
  const s = createInitialState();
  s.buildings = {};
  s.units = {};
  s.cityStats.population = 0;
  return s;
}

describe("transit breakdown — capacity and load mirror the sim", () => {
  it("computeTransitCapacity / computeTransitLoad weight the stacks", () => {
    // 1 maglev * 50 + 2 skyrail * 30 + 5 traffic droids * 4 = 130.
    expect(
      computeTransitCapacity(
        { undergroundMaglevSystem: 1, skyrailTransitLines: 2 },
        { trafficControlDroid: 5 },
      ),
    ).toBe(130);
    // floor(30000 / 6000) + 2 towers * 8 + 3 plants * 5 = 5 + 16 + 15 = 36.
    expect(
      computeTransitLoad(30000, { habBlockMegaTowers: 2, megaManufacturingPlants: 3 }),
    ).toBe(36);
  });

  it("a comfortable grid raises no suggestions", () => {
    const s = baseState();
    s.buildings = { undergroundMaglevSystem: 2 }; // capacity 100
    s.cityStats.population = 60000; // load 10
    const bd = computeTransitBreakdown(s);
    expect(bd.transitCapacity).toBe(100);
    expect(bd.transitLoad).toBe(10);
    expect(bd.overloaded).toBe(false);
    expect(bd.headroom).toBe(90);
    expect(bd.suggestions).toHaveLength(0);
  });

  it("the reported invisible overload (240/80) is fully decomposed", () => {
    // The task report: transit overloaded 240 vs 80 with nothing visibly
    // explaining it. 1,200,000 citizens (200) + 5 mega towers (40) = 240 load
    // against 1 maglev + 1 skyrail = 80 capacity.
    const s = baseState();
    s.buildings = {
      undergroundMaglevSystem: 1,
      skyrailTransitLines: 1,
      habBlockMegaTowers: 5,
    };
    s.cityStats.population = 1_200_000;
    const bd = computeTransitBreakdown(s);
    expect(bd.transitCapacity).toBe(80);
    expect(bd.transitLoad).toBe(240);
    expect(bd.overloaded).toBe(true);
    expect(bd.headroom).toBe(-160);
    // Every point of capacity and load is attributed to a named source.
    expect(bd.capacitySources.map((c) => c.amount).reduce((a, b) => a + b, 0)).toBe(80);
    expect(bd.loadSources.map((c) => c.amount).reduce((a, b) => a + b, 0)).toBe(240);
    expect(bd.loadSources[0]).toEqual({ label: "Citizen commuters", amount: 200 });
    expect(bd.loadSources.find((c) => c.label === "Hab-block mega towers")?.amount).toBe(40);
    // The overload offers build + recruit fixes and the load explainer note.
    const screens = bd.suggestions.map((sg) => sg.target?.screen);
    expect(screens).toContain("construction");
    expect(screens).toContain("recruitment");
    // The load explainer is intentionally plain text — nothing demolishes load.
    expect(bd.suggestions.some((sg) => !sg.target)).toBe(true);
  });

  it("the card warns at 90% load, before the penalty actually starts", () => {
    const s = baseState();
    s.buildings = { undergroundMaglevSystem: 2 }; // capacity 100
    s.cityStats.population = 540_000; // load 90 -> exactly the warn ratio
    const bd = computeTransitBreakdown(s);
    expect(bd.overloaded).toBe(false);
    expect(bd.suggestions.length).toBeGreaterThan(0);
    // Under the warn ratio the card stays quiet.
    s.cityStats.population = 480_000; // load 80
    expect(computeTransitBreakdown(s).suggestions).toHaveLength(0);
  });
});

describe("transit fix suggestions — deep-links stay valid", () => {
  type ConstructionTarget = Extract<TransitSuggestionTarget, { screen: "construction" }>;

  const constructionSource = engineSource("../../app/(game)/construction.tsx");
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  const overloadedState = (): GameState => {
    const s = baseState();
    s.cityStats.population = 600_000; // load 100, capacity 0
    return s;
  };

  it("every construction deep-link resolves to a real category id", () => {
    const targets = computeTransitBreakdown(overloadedState())
      .suggestions.map((sg) => sg.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        validCategoryIds.has(target.category),
        `transit fix tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("every suggested deep-link resolves to a known destination screen", () => {
    const validScreens = new Set(["construction", "recruitment"]);
    const screens = computeTransitBreakdown(overloadedState())
      .suggestions.map((sg) => sg.target?.screen)
      .filter((x): x is NonNullable<typeof x> => x != null);
    expect(screens.length).toBeGreaterThan(0);
    for (const screen of screens) {
      expect(validScreens.has(screen), `unknown deep-link screen "${screen}"`).toBe(true);
    }
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const push = router.push as unknown as ReturnType<typeof vi.fn>;
    const targets = computeTransitBreakdown(overloadedState())
      .suggestions.map((suggestion) => suggestion.target)
      .filter((target): target is NonNullable<typeof target> => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToTransitSuggestion(target);
      expect(push, `transit recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });

  it("the build tip lands on the highest-capacity line", () => {
    const tip = computeTransitBreakdown(overloadedState())
      .suggestions.map((sg) => sg.target)
      .find(
        (t): t is ConstructionTarget => t?.screen === "construction" && t.category === "transit",
      );
    // undergroundMaglevSystem is the heaviest capacity weight (50).
    expect(tip?.highlight).toBe("undergroundMaglevSystem");
  });
});

describe("transit weights and penalties stay pinned to the sim", () => {
  const formulasSource = engineSource("../formulas.ts");

  const pinned = (key: string, weight: number): boolean => {
    const w = String(weight).replace(".", "\\.");
    return new RegExp(`"${key}"\\s*\\)\\s*\\*\\s*${w}\\b`).test(formulasSource);
  };

  it("every capacity and load weight matches the sim", () => {
    for (const [key, weight] of Object.entries(TRANSIT_CAPACITY_BUILDING_WEIGHTS)) {
      expect(pinned(key, weight), `transit capacity building "${key}" (weight ${weight}) drifted`).toBe(true);
    }
    for (const [key, weight] of Object.entries(TRANSIT_CAPACITY_UNIT_WEIGHTS)) {
      expect(pinned(key, weight), `transit capacity unit "${key}" (weight ${weight}) drifted`).toBe(true);
    }
    for (const [key, weight] of Object.entries(TRANSIT_LOAD_BUILDING_WEIGHTS)) {
      expect(pinned(key, weight), `transit load building "${key}" (weight ${weight}) drifted`).toBe(true);
    }
  });

  it("the population divisor and overload penalties match the sim", () => {
    expect(formulasSource).toMatch(
      new RegExp(`population / ${TRANSIT_POP_PER_LOAD_POINT}\\b`),
    );
    // The overload branch drains happiness -1 and employment -0.5 per tick.
    expect(formulasSource).toMatch(/transitLoad > ut\.transitCapacity/);
    expect(formulasSource).toMatch(
      new RegExp(
        `happiness - ${TRANSIT_OVERLOAD_HAPPINESS_PENALTY}\\b[\\s\\S]{0,120}employment - ${String(TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY).replace(".", "\\.")}\\b`,
      ),
    );
  });

  it("the warn ratio warns strictly before the sim's penalty threshold", () => {
    expect(TRANSIT_WARN_LOAD_RATIO).toBeLessThan(1);
    expect(TRANSIT_WARN_LOAD_RATIO).toBeGreaterThan(0.5);
  });
});

describe("transit breakdown — overview entry points stay wired", () => {
  // The card is only discoverable if the overview screen actually links to it.
  // Source pins on app/(game)/overview.tsx (un-importable Expo screen module).
  const overviewSource = engineSource("../../app/(game)/overview.tsx");

  it("the transit utility readout taps through to the transit card", () => {
    expect(overviewSource).toContain('scrollToBreakdownCard("transit")');
    // The readout shows live load vs capacity from the same leaf module.
    expect(overviewSource).toContain("computeTransitBreakdown(state)");
    // And the scroll target is registered where the card is rendered.
    expect(overviewSource).toContain("breakdownCardYRef.current.transit");
    expect(overviewSource).toContain("<TransitBreakdownCard state={state} />");
  });

  it("the card shows every factor — no truncation of contributors", () => {
    const cardSource = engineSource("../../components/TransitBreakdownCard.tsx");
    expect(cardSource).not.toContain(".slice(0,");
  });
});
