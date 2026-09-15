// Regression test for the "runaway population numbers" launch-blocker
// (Android Chrome playtest, screenshot showed POPULATION =
// `2.115025176753469e+242B` with `+301.20%/tick`) and the follow-up
// "overnight 100B population" bug (a growth edict permanently ratcheted
// `cityStats.populationGrowthRate` every tick it was active, so an
// overnight offline catch-up compounded 5M citizens into the 100B
// ceiling). Guards pinned here:
//   1. `sanitizeCityStats` clamps `populationGrowthRate` to
//      ±MAX_BASE_POP_GROWTH_RATE (0.1) and `population` to
//      MAX_POPULATION on every save load.
//   2. `runTick` clamps the *effective* per-tick growth rate to ±0.15 and
//      caps `cs.population` at MAX_POPULATION after the delta is applied.
//   3. Active edicts contribute growth as a TEMPORARY per-tick modifier
//      (like policies) and never mutate the persistent base rate.
//   4. Content data (edicts / techs / policies) can never ship a growth
//      effect large enough to recreate the ratchet's damage.
//   5. `formatPop` / `formatNumber` / `formatCredits` render "MAX"
//      instead of falling through to JS scientific notation if a value
//      somehow escapes (defense in depth — see format.test if present).
//
// This file pins the engine-side guards (#1–#4). If a future refactor
// removes a clamp or reintroduces the ratchet, these tests fail loud.

import { afterEach, describe, expect, it, vi } from "vitest";
import { runTick, processMissedTicks } from "../formulas";
import { sanitizeState, MAX_BASE_POP_GROWTH_RATE } from "../sanitizer";
import { createInitialState } from "../initialState";
import { ALL_EDICTS } from "../edicts";
import { ALL_TECHNOLOGIES } from "../technologies";
import { ALL_POLICIES } from "../policies";
import type { GameState } from "../types";

const MAX_POPULATION = 100_000_000_000;

function freshState(): GameState {
  const s = createInitialState();
  // New games start paused for the first-run orientation; these tests
  // exercise live simulation.
  s.tickPaused = false;
  return s;
}

function activateEdict(s: GameState, edictId: string, ticksRemaining: number) {
  s.activeEdicts = [
    ...(s.activeEdicts ?? []),
    {
      edictId,
      ticksRemaining,
      issuedAtTick: s.totalTicks,
      cooldownUntilTick: s.totalTicks + 100,
    },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("population overflow guard (launch-blocker fix)", () => {
  it("sanitizer clamps absurd populationGrowthRate to ±MAX_BASE_POP_GROWTH_RATE", () => {
    const s = freshState();
    s.cityStats.populationGrowthRate = 3.012; // observed in user's broken save
    const clean = sanitizeState(s);
    expect(clean.cityStats.populationGrowthRate).toBeLessThanOrEqual(MAX_BASE_POP_GROWTH_RATE);
    expect(clean.cityStats.populationGrowthRate).toBeGreaterThanOrEqual(-MAX_BASE_POP_GROWTH_RATE);
    // Pin the constant itself: raising it back toward 0.5 re-opens the
    // overnight-explosion window (0.5 base → 6.25%/tick effective).
    expect(MAX_BASE_POP_GROWTH_RATE).toBeLessThanOrEqual(0.1);
  });

  it("sanitizer caps absurd population at MAX_POPULATION on load", () => {
    const s = freshState();
    s.cityStats.population = 2.115e242; // observed value from screenshot
    const clean = sanitizeState(s);
    expect(clean.cityStats.population).toBe(MAX_POPULATION);
    expect(Number.isFinite(clean.cityStats.population)).toBe(true);
  });

  it("runTick refuses to compound population past MAX_POPULATION", () => {
    let s = freshState();
    // Force the worst case: max base growth rate plus near-max population.
    s.cityStats.populationGrowthRate = MAX_BASE_POP_GROWTH_RATE;
    s.cityStats.population = 99_000_000_000;
    for (let i = 0; i < 50; i++) s = runTick(s).newState;
    expect(s.cityStats.population).toBeLessThanOrEqual(MAX_POPULATION);
    expect(Number.isFinite(s.cityStats.population)).toBe(true);
  });

  it("runTick clamps the effective per-tick growth rate (no 300%/tick)", () => {
    const s = freshState();
    // Feed a pre-sanitizer corrupt base rate straight into runTick: the
    // effective-rate clamp (±0.15) must contain it on its own. Population
    // sits well under housing capacity so growth actually applies.
    s.cityStats.populationGrowthRate = 3.0;
    const before = s.cityStats.population;
    const after = runTick(s).newState.cityStats.population;
    // Prove the tick actually grew the city (guards against a vacuous
    // pass if the simulation were skipped entirely).
    expect(after).toBeGreaterThan(before);
    // At the max effective rate (0.15), the per-tick multiplier is
    // (1 + 0.15*0.5/4) = 1.01875. Allow some headroom for other bonuses
    // but a 1.05× per-tick gain would mean the clamp failed.
    expect(after / before).toBeLessThan(1.05);
  });

  it("overnight catch-up on a HEALTHY 5M save produces a plausible change", () => {
    const s = freshState();
    // A healthy save: 5M citizens backed by real housing and a sane base
    // growth rate. An overnight absence at the default 15-minute interval
    // is 96 missed ticks — all simulated (batch limit 200), no
    // extrapolation. Population should drift, not explode.
    s.buildings = { ...s.buildings, habBlockMegaTowers: 1000 };
    s.cityStats.population = 5_000_000;
    s.cityStats.populationGrowthRate = 0.005;
    s.resources.food = 10_000_000;
    s.resources.water = 10_000_000;
    const { newState } = processMissedTicks(s, 96, 200);
    const pop = newState.cityStats.population;
    expect(Number.isFinite(pop)).toBe(true);
    // Plausible overnight band: the city neither collapses nor multiplies.
    // Even at the max effective rate (1.875%/tick), 96 ticks compound to
    // ~6x; a healthy save's actual rate is far below that. Anything past
    // 2x overnight means a growth clamp regressed.
    expect(pop).toBeGreaterThan(2_500_000);
    expect(pop).toBeLessThan(10_000_000);
  });

  it("overnight catch-up from a drifted save stays plausible (no 100B blow-up)", () => {
    const s = freshState();
    // A pre-fix drifted save: 5M citizens and a ratcheted base rate of 3.0
    // (observed in the wild). 1500 missed ticks ≈ an overnight absence at
    // the shortest tick interval. Under the old 0.5 caps this compounded
    // straight into the 100B ceiling and drained every consumable.
    s.cityStats.population = 5_000_000;
    s.cityStats.populationGrowthRate = 3.0;
    const { newState } = processMissedTicks(s, 1500, 200);
    expect(Number.isFinite(newState.cityStats.population)).toBe(true);
    // The simulation ran (population moved) but stayed orders of magnitude
    // below the 100B ceiling the old caps allowed it to hit.
    expect(newState.cityStats.population).not.toBe(5_000_000);
    expect(newState.cityStats.population).toBeLessThan(1_000_000_000);
  });
});

describe("edict growth ratchet regression (100B overnight bug)", () => {
  it("an active growth edict never mutates the persistent base rate", () => {
    let s = freshState();
    activateEdict(s, "elder_pension_top_up", 5);
    const baseline = s.cityStats.populationGrowthRate;
    // Run the edict through its full lifetime and past expiry. Under the
    // old ratchet this accumulated +populationGrowth EVERY active tick
    // with no reversal on expiry (5 ticks × 0.002 would trip the 0.001
    // tolerance below even with today's fixed data values).
    for (let i = 0; i < 10; i++) s = runTick(s).newState;
    // Prove the edict actually ran its lifetime (guards a vacuous pass).
    expect(s.activeEdicts.some((e) => e.edictId === "elder_pension_top_up")).toBe(false);
    expect(Math.abs(s.cityStats.populationGrowthRate - baseline)).toBeLessThan(0.001);
  });

  it("an active growth edict boosts population as a temporary per-tick modifier", () => {
    // Pin Math.random so both runs take identical random branches and the
    // ONLY difference between them is the active edict.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const without = freshState();
    // Population growth is capped by housing capacity, so give the city
    // enough residential construction that 1M citizens sit comfortably
    // below capacity and growth actually applies.
    without.buildings = { ...without.buildings, habBlockMegaTowers: 200 };
    without.cityStats.population = 1_000_000;
    without.resources.food = 1_000_000;
    without.resources.water = 1_000_000;
    const withEdict = structuredClone(without);
    activateEdict(withEdict, "elder_pension_top_up", 5);
    const popWithout = runTick(without).newState.cityStats.population;
    const popWith = runTick(withEdict).newState.cityStats.population;
    expect(popWithout).toBeGreaterThan(1_000_000); // baseline growth applied
    expect(popWith).toBeGreaterThan(popWithout); // edict added on top, this tick only
  });
});

// Content-data tripwire: the 100B bug was amplified by data outliers
// (edicts/techs shipping populationGrowth(Rate) of 1–2 against a family
// norm of 0.0005–0.003, i.e. 300–4000× too large). Any future content with
// a growth effect above this ceiling fails here with the offending ids.
describe("content growth-effect tripwire", () => {
  const MAX_CONTENT_GROWTH_EFFECT = 0.01;

  function offenders(list: { id: string; effects?: Record<string, unknown> }[]): string[] {
    return list
      .filter((d) => {
        const g = Math.abs(Number((d.effects as any)?.populationGrowth ?? 0));
        const gr = Math.abs(Number((d.effects as any)?.populationGrowthRate ?? 0));
        return g > MAX_CONTENT_GROWTH_EFFECT || gr > MAX_CONTENT_GROWTH_EFFECT;
      })
      .map((d) => d.id);
  }

  it("no edict ships an outsized populationGrowth(Rate) effect", () => {
    expect(offenders(ALL_EDICTS as any)).toEqual([]);
  });

  it("no technology ships an outsized populationGrowth(Rate) effect", () => {
    expect(offenders(ALL_TECHNOLOGIES as any)).toEqual([]);
  });

  it("no policy ships an outsized populationGrowth(Rate) effect", () => {
    expect(offenders(ALL_POLICIES as any)).toEqual([]);
  });
});

// Mirror guard for the OTHER late-game numbers the player sees in the
// banner / city screens (credits, food, water, steel, fuel, goods,
// medSupplies, ammo, power). The same defense-in-depth shape: sanitizer
// clamps absurd values on load, and the formatter sentinel ("MAX cr",
// "MAX") shields the UI even if a future bug slips a giant value past
// the engine. Pins MAX_RESOURCE = 100T (1e14).

const MAX_RESOURCE_T = 100_000_000_000_000;

describe("resource overflow guard (credits/food/water/etc.)", () => {
  it("sanitizer caps absurd resource values at MAX_RESOURCE on load", () => {
    const s = freshState();
    s.resources.credits = 1e30;
    s.resources.food = 1e25;
    s.resources.steel = Number.POSITIVE_INFINITY;
    const clean = sanitizeState(s);
    expect(clean.resources.credits).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.resources.food).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.resources.steel).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.resources.steel)).toBe(true);
  });

  it("sanitizer clamps absurd negative credits (deficit overflow)", () => {
    const s = freshState();
    s.resources.credits = -1e30;
    const clean = sanitizeState(s);
    expect(clean.resources.credits).toBeGreaterThanOrEqual(-MAX_RESOURCE_T);
  });

  it("sanitizer survives NaN resource values", () => {
    const s = freshState();
    s.resources.credits = NaN;
    s.resources.food = NaN;
    const clean = sanitizeState(s);
    expect(Number.isFinite(clean.resources.credits)).toBe(true);
    expect(Number.isFinite(clean.resources.food)).toBe(true);
  });

  it("runTick refuses to compound resources past MAX_RESOURCE", () => {
    let s = freshState();
    // Seed each pooled resource at the ceiling so any positive per-tick
    // delta would push it past MAX_RESOURCE without a clamp.
    s.resources.credits = MAX_RESOURCE_T;
    s.resources.food = MAX_RESOURCE_T;
    s.resources.water = MAX_RESOURCE_T;
    s.resources.steel = MAX_RESOURCE_T;
    s.resources.fuel = MAX_RESOURCE_T;
    s.resources.goods = MAX_RESOURCE_T;
    s.resources.medSupplies = MAX_RESOURCE_T;
    s.resources.ammo = MAX_RESOURCE_T;
    for (let i = 0; i < 25; i++) s = runTick(s).newState;
    expect(s.resources.credits).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.food).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.water).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.steel).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.fuel).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.goods).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.medSupplies).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(s.resources.ammo).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(s.resources.credits)).toBe(true);
  });

  it("offline-catchup extrapolation respects MAX_RESOURCE", () => {
    const s = freshState();
    // Seed a near-ceiling save and force a huge per-tick steel/credit
    // production rate so `rate * skipped` for a long absence would
    // blow past MAX_RESOURCE without the catchup ceiling.
    s.resources.credits = MAX_RESOURCE_T - 1000;
    s.resources.steel = MAX_RESOURCE_T - 1000;
    s.resources.fuel = MAX_RESOURCE_T - 1000;
    s.rates.steelProduction = 1e12;
    s.rates.fuelProduction = 1e12;
    s.rates.taxIncome = 1e12;
    s.rates.tradeIncome = 1e12;
    // Pass batchLimit=1 so count(100) > BATCH_LIMIT and the
    // `rate * skipped` extrapolation branch (not just runTick) executes.
    const { newState } = processMissedTicks(s, 100, 1);
    expect(newState.resources.credits).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(newState.resources.steel).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(newState.resources.fuel).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(newState.resources.credits)).toBe(true);
  });
});

// Final defense layer: the open-ended `state.stockpiles` record and a
// handful of monotonic lifetime counters (combat kills/casualties,
// total deaths, waste generated) only ever grow over a long Steam-launch
// playthrough. `sanitizeRecord` previously only NaN-guarded stockpiles
// (no ceiling), and the counters were only floored at 0, so over a
// 100-hour run a bonus-stacking bug could drift them toward
// Number.MAX_SAFE_INTEGER and into scientific notation in the stats UI.
// These tests pin the per-key stockpile ceiling and the counter soft
// caps, all consistent with MAX_RESOURCE (1e14).

describe("accumulator overflow guard (stockpiles + lifetime counters)", () => {
  it("caps each absurd stockpile entry at MAX_RESOURCE on load", () => {
    const s = freshState();
    s.stockpiles = {
      smallArmsAmmo: 1e30,
      missile_cruise: Number.POSITIVE_INFINITY,
      foodRation: 5_000,
    };
    const clean = sanitizeState(s);
    expect(clean.stockpiles.smallArmsAmmo).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.stockpiles.missile_cruise).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.stockpiles.missile_cruise)).toBe(true);
    // Legitimate values pass through untouched.
    expect(clean.stockpiles.foodRation).toBe(5_000);
  });

  it("bounds negative stockpile overflow and survives NaN entries", () => {
    const s = freshState();
    s.stockpiles = { glitched: -1e30, nanEntry: NaN };
    const clean = sanitizeState(s);
    expect(clean.stockpiles.glitched).toBeGreaterThanOrEqual(-MAX_RESOURCE_T);
    expect(Number.isFinite(clean.stockpiles.nanEntry)).toBe(true);
  });

  it("soft-caps combat lifetime counters at MAX_RESOURCE", () => {
    const s = freshState();
    s.combat = s.combat ?? ({} as GameState["combat"]);
    s.combat!.totalCasualties = 1e30;
    s.combat!.totalEnemyKills = Number.POSITIVE_INFINITY;
    const clean = sanitizeState(s);
    expect(clean.combat!.totalCasualties).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.combat!.totalEnemyKills).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.combat!.totalEnemyKills)).toBe(true);
  });

  it("soft-caps demographics.totalDeaths at MAX_RESOURCE", () => {
    const s = freshState();
    s.demographics.totalDeaths = 1e30;
    const clean = sanitizeState(s);
    expect(clean.demographics.totalDeaths).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.demographics.totalDeaths)).toBe(true);
  });

  it("soft-caps utilities.wasteGenerated at MAX_RESOURCE", () => {
    const s = freshState();
    s.utilities = s.utilities ?? ({} as GameState["utilities"]);
    s.utilities!.wasteGenerated = 1e30;
    const clean = sanitizeState(s);
    expect(clean.utilities!.wasteGenerated).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.utilities!.wasteGenerated)).toBe(true);
  });

  it("soft-caps combat.totalPopulationLosses at MAX_RESOURCE", () => {
    const s = freshState();
    s.combat = s.combat ?? ({} as GameState["combat"]);
    s.combat!.totalPopulationLosses = 1e30;
    const clean = sanitizeState(s);
    expect(clean.combat!.totalPopulationLosses).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.combat!.totalPopulationLosses)).toBe(true);
  });

  it("soft-caps utilities.wasteProcessed at MAX_RESOURCE", () => {
    const s = freshState();
    s.utilities = s.utilities ?? ({} as GameState["utilities"]);
    s.utilities!.wasteProcessed = 1e30;
    const clean = sanitizeState(s);
    expect(clean.utilities!.wasteProcessed).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.utilities!.wasteProcessed)).toBe(true);
  });

  it("soft-caps retinue lifetime tallies at MAX_RESOURCE", () => {
    const s = freshState();
    s.retinue = s.retinue ?? ({} as GameState["retinue"]);
    s.retinue!.totalRecruits = 1e30;
    s.retinue!.totalPromotions = Number.POSITIVE_INFINITY;
    s.retinue!.totalCasualties = 1e30;
    s.retinue!.totalKills = 1e30;
    const clean = sanitizeState(s);
    expect(clean.retinue!.totalRecruits).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.retinue!.totalPromotions).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.retinue!.totalCasualties).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.retinue!.totalKills).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.retinue!.totalPromotions)).toBe(true);
  });

  it("soft-caps inventory lifetime tallies at MAX_RESOURCE", () => {
    const s = freshState();
    s.inventory = s.inventory ?? ({} as GameState["inventory"]);
    s.inventory!.totalItemsFound = 1e30;
    s.inventory!.totalItemsSold = Number.POSITIVE_INFINITY;
    const clean = sanitizeState(s);
    expect(clean.inventory!.totalItemsFound).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.inventory!.totalItemsSold).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.inventory!.totalItemsSold)).toBe(true);
  });

  it("soft-caps combat win/loss tallies at MAX_RESOURCE", () => {
    const s = freshState();
    s.combat = s.combat ?? ({} as GameState["combat"]);
    s.combat!.totalBattlesFought = 1e30;
    s.combat!.totalVictories = Number.POSITIVE_INFINITY;
    s.combat!.totalDefeats = 1e30;
    const clean = sanitizeState(s);
    expect(clean.combat!.totalBattlesFought).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.combat!.totalVictories).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.combat!.totalDefeats).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.combat!.totalVictories)).toBe(true);
  });

  it("soft-caps player lifetime tallies at MAX_RESOURCE", () => {
    const s = freshState();
    s.player.totalDecisions = 1e30;
    s.player.contractsCompleted = Number.POSITIVE_INFINITY;
    s.player.criminalsSentenced = 1e30;
    s.player.riotsQuelled = 1e30;
    const clean = sanitizeState(s);
    expect(clean.player.totalDecisions).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.player.contractsCompleted).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.player.criminalsSentenced).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.player.riotsQuelled).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.player.contractsCompleted)).toBe(true);
  });

  it("soft-caps the weekly-challenge baseline/target so delta math stays sane", () => {
    const s = freshState();
    // A save written before these caps existed (or a tampered blob) could
    // carry a baseline far above MAX_RESOURCE — `getProgress` would then be
    // `current - huge baseline` (frozen at 0) and the baseline itself would
    // render as scientific notation in the challenge UI.
    s.weeklyChallenge = {
      weekKey: "2026-W18",
      templateId: "weekly_decisions_50",
      statKey: "totalDecisions",
      baseline: 1e30,
      target: Number.POSITIVE_INFINITY,
      claimed: false,
    };
    const clean = sanitizeState(s);
    expect(clean.weeklyChallenge!.baseline).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(clean.weeklyChallenge!.target).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.weeklyChallenge!.baseline)).toBe(true);
    expect(Number.isFinite(clean.weeklyChallenge!.target)).toBe(true);
  });

  it("survives a NaN weekly-challenge baseline", () => {
    const s = freshState();
    s.weeklyChallenge = {
      weekKey: "2026-W18",
      templateId: "weekly_decisions_50",
      statKey: "totalDecisions",
      baseline: NaN,
      target: 50,
      claimed: false,
    };
    const clean = sanitizeState(s);
    expect(Number.isFinite(clean.weeklyChallenge!.baseline)).toBe(true);
    expect(clean.weeklyChallenge!.baseline).toBe(0);
    expect(clean.weeklyChallenge!.target).toBe(50);
  });

  it("soft-caps weeklyChallengesCompleted at MAX_RESOURCE", () => {
    const s = freshState();
    s.weeklyChallengesCompleted = 1e30;
    const clean = sanitizeState(s);
    expect(clean.weeklyChallengesCompleted!).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(clean.weeklyChallengesCompleted!)).toBe(true);
  });

  it("soft-caps diplomacy location-relation tallies at MAX_RESOURCE", () => {
    const s = freshState();
    s.locationRelations = s.locationRelations ?? {};
    s.locationRelations["test_loc"] = {
      disposition: 0,
      aidSent: 1e30,
      raidsSent: Number.POSITIVE_INFINITY,
      tradesMade: 1e30,
      scoutsMade: 1e30,
      lastInteractionTick: 0,
    };
    const clean = sanitizeState(s);
    const rel = clean.locationRelations!["test_loc"];
    expect(rel.aidSent).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(rel.raidsSent).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(rel.tradesMade).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(rel.scoutsMade).toBeLessThanOrEqual(MAX_RESOURCE_T);
    expect(Number.isFinite(rel.raidsSent)).toBe(true);
  });
});
