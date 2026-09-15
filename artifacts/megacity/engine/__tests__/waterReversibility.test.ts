import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import { navigateToWaterSuggestion } from "@/utils/waterNavigation";
import {
  computeWaterBreakdown,
  computeWaterProduction,
  computeWaterConsumption,
  type WaterSuggestionTarget,
} from "@/engine/waterBreakdown";
import type { GameState } from "@/engine/types";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
import { router } from "expo-router";

// ─────────────────────────────────────────────────────────────────────────────
// Water breakdown — mirrors the power / crime / biosphere "diagnose -> one-tap
// fix" pattern for the water supply. The overview screen turns each diagnosis
// into a tappable recovery tip that deep-links straight to the right screen (the
// water construction category, or the megaprojects screen). These tests prove:
//   1. the readout mirrors the sim's supply/demand levers, and
//   2. every construction-category deep-link resolves to a real category id, so
//      a rename or removal in construction.tsx is caught here (same spirit as
//      powerReversibility.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

describe("water breakdown — supply and demand mirror the sim", () => {
  it("computeWaterProduction weights the water plants", () => {
    // waterRecyclingSuperFacilities weight 240, megaDesalinationPlants 180,
    // atmosphericHarvestTowers 80.
    expect(computeWaterProduction({ waterRecyclingSuperFacilities: 2 })).toBe(480);
    expect(computeWaterProduction({ megaDesalinationPlants: 3 })).toBe(540);
    expect(
      computeWaterProduction({ atmosphericHarvestTowers: 1, waterPumpStations: 2 }),
    ).toBe(80 + 80);
  });

  it("computeWaterConsumption mirrors the population/class-mix formula", () => {
    // floor((population / 5500) * (1 + highPct*0.3 - lowPct*0.1)).
    // 110000 pop, no class skew -> floor(110000/5500) = 20.
    expect(computeWaterConsumption(110000, 0, 0)).toBe(20);
    // A high-income-heavy city uses more: highPct = 55000/110000 = 0.5 ->
    // multiplier 1.15 -> floor(20 * 1.15) = 23.
    expect(computeWaterConsumption(110000, 55000, 0)).toBe(23);
    // A low-income-heavy city uses less: lowPct = 0.5 -> multiplier 0.95 ->
    // floor(20 * 0.95) = 19.
    expect(computeWaterConsumption(110000, 0, 55000)).toBe(19);
    // Zero / non-finite population draws nothing.
    expect(computeWaterConsumption(0, 0, 0)).toBe(0);
    expect(computeWaterConsumption(Number.NaN, 0, 0)).toBe(0);
  });

  it("a well-supplied city reports a surplus and no suggestions", () => {
    const state = createInitialState();
    state.resources.water = 3000;
    state.buildings = { waterRecyclingSuperFacilities: 20 }; // 4800/tick
    const bd = computeWaterBreakdown(state);
    expect(bd.netPerTick).toBeGreaterThan(0);
    expect(bd.suggestions).toHaveLength(0);
    expect(bd.positives.some((p) => p.label === "Water production")).toBe(true);
    expect(bd.negatives.some((n) => n.label === "Population water use")).toBe(true);
  });

  it("a starved city reads as a shortage with named demand", () => {
    const state = createInitialState();
    state.resources.water = 50;
    state.buildings = {}; // no production at all
    const bd = computeWaterBreakdown(state);
    expect(bd.production).toBe(0);
    expect(bd.netPerTick).toBeLessThan(0);
    expect(bd.negatives.map((n) => n.label)).toContain("Population water use");
  });

  it("operational water megaprojects lift production and net exactly like the sim", () => {
    const state = createInitialState();
    state.resources.water = 100;
    // A big population with no plants runs a shortage on plants alone.
    state.buildings = {};
    state.megaProjects = [];
    const plantOnly = computeWaterBreakdown(state);
    expect(plantOnly.production).toBe(0);

    // A subterranean_reservoir (+200) must count toward supply, matching the
    // tick math. A non-water megaproject (space_elevator) contributes zero.
    state.megaProjects = [
      { projectId: "subterranean_reservoir", phase: "operational" } as any,
      { projectId: "space_elevator", phase: "operational" } as any,
    ];
    const withMega = computeWaterBreakdown(state);
    expect(withMega.production).toBe(200);
    expect(withMega.netPerTick).toBe(plantOnly.netPerTick + 200);
    expect(
      withMega.positives.some((p) => p.label === "Water megaproject output" && p.amount === 200),
    ).toBe(true);
  });

  it("only operational water megaprojects count toward supply", () => {
    const state = createInitialState();
    state.resources.water = 100;
    state.buildings = {};
    // In-progress / non-water projects contribute zero production.
    state.megaProjects = [
      { projectId: "subterranean_reservoir", phase: "construction" } as any,
      { projectId: "underground_rail", phase: "operational" } as any,
    ];
    const bd = computeWaterBreakdown(state);
    expect(bd.production).toBe(0);
    expect(bd.positives.some((p) => p.label === "Water megaproject output")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Water recovery tips must always deep-link somewhere valid. Every construction
// target carries a { screen: "construction", category } that construction.tsx
// must recognise — a tip whose category is not a real CATEGORIES id would
// silently fall back to the first tab, a confusing dead-end. This reads the
// category ids straight from the construction screen (source of truth) and
// asserts every construction target emitted by computeWaterBreakdown resolves to
// one of them, driving every suggestion branch at once.
// ─────────────────────────────────────────────────────────────────────────────
describe("water recovery suggestions — deep-links stay valid", () => {
  const push = router.push as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => push.mockReset());
  type ConstructionTarget = Extract<WaterSuggestionTarget, { screen: "construction" }>;

  // Text-parse the real category ids from construction.tsx rather than importing
  // the screen (a React Native / expo-router module whose native graph would need
  // mocking in the node test env). A rename or removal there is still caught here.
  const constructionSource = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/(game)/construction.tsx",
    ),
    "utf8",
  );
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  // Guard against a silently-broken parse (moved file, changed shape): if this
  // ever comes up empty the coverage assertions below would pass vacuously.
  it("parses a sane set of construction category ids", () => {
    expect(validCategoryIds.size).toBeGreaterThanOrEqual(10);
    expect(validCategoryIds.has("water")).toBe(true);
  });

  // A city running a shortage, with no water megaproject, trips every recovery
  // branch at once:
  //   shortage                       -> construction/water (build production)
  //   shortage + no water megaproject-> megaprojects
  const worstCaseState = (): GameState => {
    const state = createInitialState();
    state.resources.water = 20;
    state.buildings = {}; // no production, so population demand outpaces supply
    state.megaProjects = [];
    return state;
  };

  it("drives every suggestion branch", () => {
    const { suggestions } = computeWaterBreakdown(worstCaseState());
    // Both branches fire. If a new branch is added and this test does not
    // exercise it, the count changes and forces this to be updated.
    expect(suggestions).toHaveLength(2);
    const screens = suggestions.map((s) => s.target?.screen);
    expect(screens).toContain("megaprojects");
    expect(screens).toContain("construction");
  });

  it("every construction deep-link target resolves to a real category id", () => {
    const { suggestions } = computeWaterBreakdown(worstCaseState());
    const constructionTargets = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(constructionTargets.length).toBeGreaterThan(0);
    for (const target of constructionTargets) {
      expect(
        validCategoryIds.has(target.category),
        `water recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("the production tip lands on the highest-output water plant", () => {
    const { suggestions } = computeWaterBreakdown(worstCaseState());
    const prodTip = suggestions
      .map((s) => s.target)
      .find(
        (t): t is ConstructionTarget =>
          t?.screen === "construction" &&
          t.category === "water" &&
          t.highlight === "waterRecyclingSuperFacilities",
      );
    expect(prodTip).toBeTruthy();
  });

  it("an operational water megaproject suppresses the megaproject tip", () => {
    const state = worstCaseState();
    state.megaProjects = [{ projectId: "subterranean_reservoir", phase: "operational" } as any];
    const { suggestions } = computeWaterBreakdown(state);
    expect(suggestions.some((s) => s.target?.screen === "megaprojects")).toBe(false);
  });

  it("a healthy supply nags with nothing", () => {
    const state = createInitialState();
    state.resources.water = 5000;
    state.buildings = { waterRecyclingSuperFacilities: 50 };
    const { suggestions } = computeWaterBreakdown(state);
    expect(suggestions).toHaveLength(0);
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const { suggestions } = computeWaterBreakdown(worstCaseState());
    const targets = suggestions
      .map((suggestion) => suggestion.target)
      .filter((target): target is WaterSuggestionTarget => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToWaterSuggestion(target);
      expect(push, `water recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });
});
