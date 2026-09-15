import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import {
  computePowerBreakdown,
  computePowerEta,
  computePowerGeneration,
  computePowerDrain,
  computeStabilizerFactor,
  SEASON_POWER_DRAIN_MULT,
  WEATHER_POWER_DRAIN_DELTA,
  POWER_STOCKPILE_FLOOR,
  type PowerBreakdown,
  type PowerSuggestionTarget,
} from "@/engine/powerBreakdown";
import { runTick } from "@/engine/formulas";
import { getSeasonalModifiers, WEATHER_EFFECTS, type Season } from "@/engine/weather";
import type { GameState } from "@/engine/types";
import { navigateToPowerSuggestion } from "@/utils/powerNavigation";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
import { router } from "expo-router";

// ─────────────────────────────────────────────────────────────────────────────
// Power breakdown — mirrors the crime / biosphere "diagnose -> one-tap fix"
// pattern for the power grid. The overview screen turns each diagnosis into a
// tappable recovery tip that deep-links straight to the right screen (the energy
// construction category, or the megaprojects screen). These tests prove:
//   1. the readout mirrors the sim's supply/demand levers, and
//   2. every construction-category deep-link resolves to a real category id, so
//      a rename or removal in construction.tsx is caught here (same spirit as
//      crimeReversibility.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

describe("power breakdown — supply and demand mirror the sim", () => {
  it("computePowerGeneration / computePowerDrain weight the grid stacks", () => {
    // fusionReactors weight 500, habBlockMegaTowers drain 12, tacticalCombatDrones 0.5.
    expect(computePowerGeneration({ fusionReactors: 2 })).toBe(1000);
    expect(computePowerDrain({ habBlockMegaTowers: 2 }, {})).toBe(24);
    expect(computePowerDrain({}, { tacticalCombatDrones: 4 })).toBeCloseTo(2, 5);
  });

  it("grid stabilizers trim drain, mirroring the sim's unclamped factor", () => {
    expect(computeStabilizerFactor({})).toBeCloseTo(1, 5);
    expect(computeStabilizerFactor({ powerGridStabilizers: 10 })).toBeCloseTo(0.7, 5);
    // formulas.ts does NOT clamp powerStabilizer, so an over-stack drives the
    // factor negative (drain flips into a small generation bonus). The readout
    // must mirror this exactly rather than clamp at 0 and diverge from the tick.
    expect(computeStabilizerFactor({ powerGridStabilizers: 34 })).toBeCloseTo(-0.02, 5);
    expect(computeStabilizerFactor({ powerGridStabilizers: 100 })).toBeCloseTo(-2, 5);
  });

  it("an over-stack of stabilizers turns drain into net supply (matches the sim)", () => {
    const state = createInitialState();
    state.resources.power = 1000;
    // rawDrain 350 (10 plants x 35), factor 1 - 34*0.03 = -0.02.
    state.buildings = { megaManufacturingPlants: 10, powerGridStabilizers: 34 };
    state.units = {};
    const bd = computePowerBreakdown(state);
    expect(bd.rawDrain).toBe(350);
    // Effective drain must equal floor(raw * the module's own factor) exactly —
    // reconstruct via computeStabilizerFactor to share the identical float path.
    const factor = computeStabilizerFactor(state.buildings);
    expect(factor).toBeLessThan(0);
    expect(bd.effectiveDrain).toBe(Math.floor(350 * factor));
    expect(bd.effectiveDrain).toBeLessThan(0);
    // net = generation - effectiveDrain, so a negative drain lifts net supply.
    expect(bd.netPerTick).toBe(bd.generation - bd.effectiveDrain);
    expect(bd.netPerTick).toBeGreaterThan(bd.generation);
  });

  it("a well-supplied grid reports a surplus and no suggestions", () => {
    const state = createInitialState();
    state.resources.power = 3000;
    state.buildings = { fusionReactors: 20 }; // 10,000 MW, nothing to drain
    state.units = {};
    const bd = computePowerBreakdown(state);
    expect(bd.netPerTick).toBeGreaterThan(0);
    expect(bd.suggestions).toHaveLength(0);
    expect(bd.positives.some((p) => p.label === "Power generation")).toBe(true);
  });

  it("stabilizer savings appear as a positive that closes the net gap", () => {
    const state = createInitialState();
    state.resources.power = 1000;
    state.buildings = { megaManufacturingPlants: 10, powerGridStabilizers: 10 };
    state.units = {};
    const bd = computePowerBreakdown(state);
    // Raw drain 350; stabilizers cut 30% -> floor(350 * 0.7) = 244 (float floor);
    // savings 106. This matches the sim's Math.floor(rawDrain * stabilizer).
    expect(bd.rawDrain).toBe(350);
    expect(bd.effectiveDrain).toBe(244);
    expect(bd.positives.some((p) => p.label === "Grid stabilizers" && p.amount === 106)).toBe(true);
    expect(bd.netPerTick).toBe(-244);
  });

  it("operational power megaprojects lift generation and net exactly like the sim", () => {
    const state = createInitialState();
    state.resources.power = 500;
    // Plants alone can't cover this drain, so the plant-only net is a deficit.
    state.buildings = { megaManufacturingPlants: 30 }; // 1050 drain, 0 generation
    state.units = {};
    state.megaProjects = [];
    const plantOnly = computePowerBreakdown(state);
    expect(plantOnly.generation).toBe(0);
    expect(plantOnly.netPerTick).toBeLessThan(0);

    // A fusion_nexus (+2000) and arcology (+200) must both count toward supply,
    // turning the diagnosis into a genuine surplus — matching the tick math.
    state.megaProjects = [
      { projectId: "fusion_nexus", phase: "operational" } as any,
      { projectId: "arcology", phase: "operational" } as any,
      { projectId: "space_elevator", phase: "operational" } as any, // no power output
    ];
    const withMega = computePowerBreakdown(state);
    expect(withMega.generation).toBe(2200);
    expect(withMega.netPerTick).toBe(plantOnly.netPerTick + 2200);
    expect(withMega.netPerTick).toBeGreaterThan(0);
    expect(
      withMega.positives.some((p) => p.label === "Power megaproject output" && p.amount === 2200),
    ).toBe(true);
    // A real surplus must not nag the player with recovery tips.
    expect(withMega.suggestions).toHaveLength(0);
  });

  it("only operational power megaprojects count toward supply", () => {
    const state = createInitialState();
    state.resources.power = 500;
    state.buildings = {};
    state.units = {};
    // In-progress / non-power projects contribute zero generation.
    state.megaProjects = [
      { projectId: "fusion_nexus", phase: "construction" } as any,
      { projectId: "underground_rail", phase: "operational" } as any,
    ];
    const bd = computePowerBreakdown(state);
    expect(bd.generation).toBe(0);
    expect(bd.positives.some((p) => p.label === "Power megaproject output")).toBe(false);
  });

  it("a starved grid reads as a deficit with named sector draws", () => {
    const state = createInitialState();
    state.resources.power = -300;
    state.buildings = {
      habBlockMegaTowers: 5,
      megaManufacturingPlants: 5,
      quantumDataCenters: 5,
      cityShieldGenerator: 2,
    };
    state.units = {};
    const bd = computePowerBreakdown(state);
    expect(bd.netPerTick).toBeLessThan(0);
    const draws = bd.negatives.map((n) => n.label);
    expect(draws).toEqual(
      expect.arrayContaining(["Residential blocks", "Industry", "Data & research", "Defense grid"]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Seasonal & weather demand swings. formulas.ts's POWER block multiplies the
// stabilized drain by the active season's power factor, then adds the active
// weather's flat power delta (floored at 0). The readout must fold the same
// swings into effectiveDrain / netPerTick — otherwise the card under-reports
// demand in winter or a storm and quietly disagrees with the tick. These tests
// pin the mirrored constants to weather.ts, reconstruct the expected drain from
// weather.ts's own source values, and confirm the live sim tick moves the grid
// by exactly what the readout predicts.
// ─────────────────────────────────────────────────────────────────────────────
describe("power breakdown — seasonal & weather demand swings mirror the sim", () => {
  // A steady industrial grid: 10 plants (raw drain 350), no stabilizers, no
  // generation, power mid-range — so effectiveDrain is easy to reason about and
  // the tick never clamps the stockpile. Season/weather start cleared.
  const drainOnlyState = (): GameState => {
    const state = createInitialState();
    state.resources.power = 2000;
    state.buildings = { megaManufacturingPlants: 10 };
    state.units = {};
    state.megaProjects = [];
    delete state.season;
    delete state.weather;
    return state;
  };

  it("the mirrored constants stay pinned to weather.ts", () => {
    // Every season's multiplier must equal weather.ts's source of truth.
    for (const season of ["spring", "summer", "autumn", "winter"] as Season[]) {
      expect(SEASON_POWER_DRAIN_MULT[season]).toBe(getSeasonalModifiers(season).powerDrain);
    }
    // The delta table must list EXACTLY the weathers that carry a powerDrain —
    // no more, no fewer — and match each value, so the mirror can't drift.
    const sourceWeathers = Object.entries(WEATHER_EFFECTS)
      .filter(([, fx]) => typeof fx.powerDrain === "number" && fx.powerDrain !== 0)
      .map(([name]) => name)
      .sort();
    expect(Object.keys(WEATHER_POWER_DRAIN_DELTA).sort()).toEqual(sourceWeathers);
    for (const name of sourceWeathers) {
      expect(WEATHER_POWER_DRAIN_DELTA[name]).toBe(WEATHER_EFFECTS[name].powerDrain);
    }
  });

  it("with no season or weather, effective drain equals the stabilized drain", () => {
    const bd = computePowerBreakdown(drainOnlyState());
    expect(bd.rawDrain).toBe(350);
    expect(bd.effectiveDrain).toBe(350);
    expect(bd.netPerTick).toBe(-350);
    expect(bd.negatives.some((n) => /load$/.test(n.label))).toBe(false);
  });

  it("a winter season multiplies the stabilized drain, matching the sim", () => {
    const state = drainOnlyState();
    state.season = "winter";
    const bd = computePowerBreakdown(state);
    // Reconstruct from weather.ts's own multiplier, exactly as the sim does.
    const expected = Math.floor(350 * getSeasonalModifiers("winter").powerDrain);
    expect(expected).toBe(437);
    expect(bd.effectiveDrain).toBe(expected);
    expect(bd.netPerTick).toBe(-expected);
    // The extra winter load surfaces as one honest demand contributor.
    expect(bd.negatives.find((n) => n.label === "Seasonal load")?.amount).toBe(437 - 350);
  });

  it("a storm adds a flat weather delta on top, floored at 0", () => {
    const state = drainOnlyState();
    state.weather = "Solar Flare"; // +25 MW in weather.ts
    const bd = computePowerBreakdown(state);
    const expected = Math.max(0, 350 + WEATHER_EFFECTS["Solar Flare"].powerDrain!);
    expect(expected).toBe(375);
    expect(bd.effectiveDrain).toBe(expected);
    expect(bd.negatives.find((n) => n.label === "Weather load")?.amount).toBe(25);
  });

  it("season and weather stack in the sim's order (multiply, then add)", () => {
    const state = drainOnlyState();
    state.season = "winter";
    state.weather = "Static Storm"; // +30 MW, the heaviest weather load
    const bd = computePowerBreakdown(state);
    // Sim order: floor(stabilized * seasonMult) THEN + weatherDelta.
    const seasonal = Math.floor(350 * getSeasonalModifiers("winter").powerDrain);
    const expected = Math.max(0, seasonal + WEATHER_EFFECTS["Static Storm"].powerDrain!);
    expect(expected).toBe(467);
    expect(bd.effectiveDrain).toBe(expected);
    expect(bd.netPerTick).toBe(-expected);
    expect(bd.negatives.find((n) => n.label === "Seasonal & weather load")?.amount).toBe(467 - 350);
  });

  it("calm weather (Overcast) adds nothing, so the readout is unchanged", () => {
    const state = drainOnlyState();
    state.weather = "Overcast"; // {} in weather.ts — no powerDrain
    const bd = computePowerBreakdown(state);
    expect(bd.effectiveDrain).toBe(350);
    expect(bd.negatives.some((n) => /load$/.test(n.label))).toBe(false);
  });

  it("the live sim tick drains the grid by exactly what the readout predicts", () => {
    // The tick applies other generation-side modifiers the readout omits, so we
    // compare the DIFFERENCE two states make: identical except season/weather.
    // Those modifiers cancel, isolating the seasonal/weather drain the readout
    // adds. The resource block reads s.season/s.weather before the tick's own
    // weather roll overwrites them, so a single injected tick uses our values.
    const baseline = drainOnlyState();
    const stormy = drainOnlyState();
    stormy.season = "winter";
    stormy.weather = "Static Storm";

    // Predict from the readout BEFORE ticking (runTick rerolls weather).
    const conditionLoad = computePowerBreakdown(stormy).negatives.find(
      (n) => n.label === "Seasonal & weather load",
    );
    expect(conditionLoad?.amount).toBe(467 - 350);

    const baseBefore = baseline.resources.power;
    const stormBefore = stormy.resources.power;
    const baseDelta = runTick(baseline).newState.resources.power - baseBefore;
    const stormDelta = runTick(stormy).newState.resources.power - stormBefore;

    // The extra drain the sim applied is exactly the readout's condition load.
    expect(baseDelta - stormDelta).toBe(conditionLoad!.amount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Power recovery tips must always deep-link somewhere valid. Every construction
// target carries a { screen: "construction", category } that construction.tsx
// must recognise — a tip whose category is not a real CATEGORIES id would
// silently fall back to the first tab, a confusing dead-end. This reads the
// category ids straight from the construction screen (source of truth) and
// asserts every construction target emitted by computePowerBreakdown resolves to
// one of them, driving every suggestion branch at once.
// ─────────────────────────────────────────────────────────────────────────────
describe("power recovery suggestions — deep-links stay valid", () => {
  const push = router.push as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => push.mockReset());
  type ConstructionTarget = Extract<PowerSuggestionTarget, { screen: "construction" }>;

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
    expect(validCategoryIds.has("energy")).toBe(true);
  });

  // A single grid running a deep deficit, with no stabilizers, no storage vaults,
  // and no power megaproject trips every recovery branch at once:
  //   deficit                       -> construction/energy (build generation)
  //   deficit + drain + headroom    -> construction/energy (grid stabilizers)
  //   no energy storage vaults      -> construction/energy (storage vaults)
  //   deficit + no power megaproject-> megaprojects
  const worstCaseState = (): GameState => {
    const state = createInitialState();
    state.resources.power = -400;
    state.buildings = {
      megaManufacturingPlants: 20,
      quantumDataCenters: 10,
      cityShieldGenerator: 5,
    };
    state.units = {};
    state.megaProjects = [];
    return state;
  };

  it("drives every suggestion branch", () => {
    const { suggestions } = computePowerBreakdown(worstCaseState());
    // All four branches fire. If a new branch is added and this test does not
    // exercise it, the count changes and forces this to be updated.
    expect(suggestions).toHaveLength(4);
    const screens = suggestions.map((s) => s.target?.screen);
    expect(screens).toContain("megaprojects");
    const categories = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction")
      .map((t) => t.category);
    // Three distinct energy-category tips (generation, stabilizers, storage).
    expect(categories).toEqual(["energy", "energy", "energy"]);
  });

  it("every construction deep-link target resolves to a real category id", () => {
    const { suggestions } = computePowerBreakdown(worstCaseState());
    const constructionTargets = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(constructionTargets.length).toBeGreaterThan(0);
    for (const target of constructionTargets) {
      expect(
        validCategoryIds.has(target.category),
        `power recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("the generation tip lands on the highest-output power plant", () => {
    const { suggestions } = computePowerBreakdown(worstCaseState());
    const genTip = suggestions
      .map((s) => s.target)
      .find(
        (t): t is ConstructionTarget =>
          t?.screen === "construction" && t.category === "energy" && t.highlight === "fusionReactors",
      );
    expect(genTip).toBeTruthy();
  });

  it("the stabilizer and storage tips highlight their own buildings", () => {
    const { suggestions } = computePowerBreakdown(worstCaseState());
    const highlights = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction")
      .map((t) => t.highlight);
    expect(highlights).toEqual(
      expect.arrayContaining(["fusionReactors", "powerGridStabilizers", "energyStorageVaults"]),
    );
  });

  it("an operational power megaproject suppresses the megaproject tip", () => {
    const state = worstCaseState();
    state.megaProjects = [{ projectId: "fusion_nexus", phase: "operational" } as any];
    const { suggestions } = computePowerBreakdown(state);
    expect(suggestions.some((s) => s.target?.screen === "megaprojects")).toBe(false);
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const { suggestions } = computePowerBreakdown(worstCaseState());
    const targets = suggestions
      .map((suggestion) => suggestion.target)
      .filter((target): target is PowerSuggestionTarget => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToPowerSuggestion(target);
      expect(push, `power recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #426 — tell players how soon the grid goes dark at the current rate.
// computePowerEta mirrors computeBiosphereEta: it projects, at the current
// deficit pace, how many ticks until the power stockpile hits the brownout
// threshold (0) and — once already in the red — the -1000 floor where the grid
// goes fully dark. It stays silent when the grid is balanced or in surplus, so
// the readout only warns when there is genuinely something to worry about.
// ─────────────────────────────────────────────────────────────────────────────
describe("power ETA — how soon the grid goes dark", () => {
  // A minimal breakdown stub is enough: computePowerEta reads only netPerTick
  // (and power as a fallback). This keeps the ETA math isolated from the full
  // breakdown computation, exactly like the biosphere ETA tests operate on a
  // BiosphereBreakdown.
  const bd = (netPerTick: number, power = 0): PowerBreakdown => ({
    power,
    generation: 0,
    rawDrain: 0,
    effectiveDrain: 0,
    netPerTick,
    positives: [],
    negatives: [],
    suggestions: [],
  });

  it("returns null when the grid is in surplus", () => {
    expect(computePowerEta(bd(50), 1000)).toBeNull();
  });

  it("returns null when the grid is balanced (net ~0)", () => {
    expect(computePowerEta(bd(0), 1000)).toBeNull();
    expect(computePowerEta(bd(-0.04), 1000)).toBeNull(); // inside the dead-band
  });

  it("projects a brownout while the stockpile is still positive", () => {
    // 500 stockpile draining at 100/tick -> hits 0 in 5 ticks.
    const eta = computePowerEta(bd(-100), 500);
    expect(eta).toEqual({ kind: "brownout", target: 0, ticks: 5 });
  });

  it("rounds partial ticks up (you are not safe until the tick completes)", () => {
    // 450 / 100 = 4.5 -> 5 whole ticks.
    const eta = computePowerEta(bd(-100), 450);
    expect(eta?.kind).toBe("brownout");
    expect(eta?.ticks).toBe(5);
  });

  it("projects the full blackout once the stockpile is already in the red", () => {
    // Already at -200, draining 100/tick -> reaches the -1000 floor in 8 ticks.
    const eta = computePowerEta(bd(-100), -200);
    expect(eta).toEqual({ kind: "blackout", target: POWER_STOCKPILE_FLOOR, ticks: 8 });
  });

  it("returns null once the stockpile is already at/below the floor", () => {
    expect(computePowerEta(bd(-100), POWER_STOCKPILE_FLOOR)).toBeNull();
    expect(computePowerEta(bd(-100), -1500)).toBeNull();
  });

  it("a faster deficit means a sooner brownout (monotonic in the drain rate)", () => {
    const slow = computePowerEta(bd(-50), 1000);
    const fast = computePowerEta(bd(-200), 1000);
    expect(slow?.ticks).toBeGreaterThan(fast!.ticks);
  });

  it("falls back to the breakdown's own stockpile when the passed value is not finite", () => {
    const eta = computePowerEta(bd(-100, 300), Number.NaN);
    expect(eta).toEqual({ kind: "brownout", target: 0, ticks: 3 });
  });

  it("mirrors the sim on a real deficit state", () => {
    const state = createInitialState();
    // A drain-heavy sector with no generation: guaranteed deficit.
    state.buildings = { habBlockMegaTowers: 50 }; // 600 drain, 0 gen
    state.units = {};
    state.resources = { ...state.resources, power: 300 } as typeof state.resources;
    const breakdown = computePowerBreakdown(state);
    expect(breakdown.netPerTick).toBeLessThan(0);
    const eta = computePowerEta(breakdown, breakdown.power);
    expect(eta).not.toBeNull();
    expect(eta?.kind).toBe("brownout");
    expect(eta?.ticks).toBeGreaterThan(0);
  });
});
