// Task #473 — Income & expense display accuracy.
//
// Two layers of protection:
//  1. Accounting invariant: every credit-unit tick entry must sum to the
//     ACTUAL credits delta produced by the tick. Any future credit flow added
//     without a tick entry (like the old nuclear maintenance, zone tribute,
//     contract fees and installation upkeep) breaks this immediately.
//  2. Component parity: computeEconomyBreakdown — the single source the
//     Overview/Economy/Military tabs render — must agree entry-for-entry with
//     what runTick just charged. If the engine's math drifts away from the
//     shared module, this catches it.
//
// Also pins the unit-upkeep def coverage (every UNIT_CATEGORIES def is
// charged exactly what its card advertises) and quantifies the save-impact of
// switching from the legacy hand-copied 39-key upkeep list to the full def
// table.

import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState, createOneMonthState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  computeEconomyBreakdown,
  computeTaxAfterOverhead,
  computeTradeAfterCongestion,
  computeUnitUpkeep,
  computeUnitUpkeepBase,
  getUpkeepMult,
} from "@/engine/economyBreakdown";
import { UNIT_CATEGORIES } from "@/engine/contracts";
import type { GameState, TickEntry } from "@/engine/types";

function sumCreditEntries(entries: TickEntry[]): number {
  return entries
    .filter((e) => e.unit === "credits")
    .reduce((sum, e) => sum + e.delta, 0);
}

function entryDelta(entries: TickEntry[], label: string): number {
  return entries
    .filter((e) => e.unit === "credits" && e.label === label)
    .reduce((sum, e) => sum + e.delta, 0);
}

function makeMidGameState(): GameState {
  const s = createInitialState();
  s.cityStats.population = 150_000; // below the 200k overhead threshold
  s.resources.credits = 5_000_000; // treasury never clamps at zero mid-test
  return s;
}

describe("economy breakdown — tick accounting invariant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("credit tick entries sum exactly to the credits delta (fresh city)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = makeMidGameState();
    for (let i = 0; i < 2; i++) {
      const before = s.resources.credits;
      const { newState, entries } = runTick(s);
      const delta = newState.resources.credits - before;
      expect(sumCreditEntries(entries)).toBe(delta);
      s = newState;
    }
  });

  it("credit tick entries sum exactly to the credits delta (mature city)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = createOneMonthState();
    s.resources.credits = 50_000_000;
    for (let i = 0; i < 3; i++) {
      const before = s.resources.credits;
      const { newState, entries } = runTick(s);
      const delta = newState.resources.credits - before;
      expect(sumCreditEntries(entries)).toBe(delta);
      s = newState;
    }
  });

  it("credit tick entries stay in balance while a fiscal edict is active", () => {
    // emergency_power_reroute: creditsPerTick 4000 for 4 ticks. Edict credit
    // effects must be booked as "Edict Credits" ledger entries or the
    // invariant above silently breaks the moment a player activates one.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = createOneMonthState();
    s.resources.credits = 50_000_000;
    s.activeEdicts = [
      {
        edictId: "emergency_power_reroute",
        ticksRemaining: 4,
        issuedAtTick: s.totalTicks,
        cooldownUntilTick: s.totalTicks + 16,
      },
    ];
    for (let i = 0; i < 3; i++) {
      const before = s.resources.credits;
      const { newState, entries } = runTick(s);
      const delta = newState.resources.credits - before;
      expect(sumCreditEntries(entries)).toBe(delta);
      expect(entryDelta(entries, "Edict Credits")).toBe(4000);
      s = newState;
    }
  });
});

describe("economy breakdown — component parity with the tick", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("breakdown components equal the entries the tick just booked", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const s0 = makeMidGameState();
    const t1 = runTick(s0);
    const t2 = runTick(t1.newState);
    const s2 = t2.newState;
    const e2 = t2.entries;

    // The breakdown of the post-tick state must mirror what that tick charged:
    // the tick persists the same recalculated rates it credited from, and the
    // upkeep tables/difficulty are identical inputs on both sides.
    const bd = computeEconomyBreakdown(s2);

    // Revenue lines book the GROSS; the friction lines carry the withheld
    // part, so the ledger sums to the net that actually hit the treasury.
    expect(entryDelta(e2, "Tax Revenue")).toBe(bd.income.taxGross - bd.income.licensedCompanyTax);
    expect(entryDelta(e2, "Commercial Licensing")).toBe(bd.income.licensedCompanyTax);
    expect(entryDelta(e2, "Bureaucratic Overhead")).toBe(-bd.income.overhead || 0);
    expect(entryDelta(e2, "Trade Income")).toBe(bd.income.tradeGross);
    expect(entryDelta(e2, "Port Congestion")).toBe(-bd.income.portCongestion || 0);
    expect(entryDelta(e2, "Tourism Income")).toBe(bd.income.tourism);
    expect(entryDelta(e2, "Reclamation Tax")).toBe(bd.income.reclamationTax);
    expect(entryDelta(e2, "Black Market Ore")).toBe(bd.income.blackMarketOre);
    expect(entryDelta(e2, "Zone Tribute")).toBe(bd.income.zoneTribute);
    expect(entryDelta(e2, "Enterprise Tax")).toBe(bd.income.enterpriseTax);

    expect(entryDelta(e2, "Unit Upkeep")).toBe(-bd.expenses.unitUpkeep || 0);
    expect(entryDelta(e2, "Infrastructure Upkeep")).toBe(-bd.expenses.infraUpkeep || 0);
    expect(entryDelta(e2, "Company Contracts")).toBe(-bd.expenses.companyMaintenance || 0);
    expect(entryDelta(e2, "Garrison Upkeep")).toBe(-bd.expenses.garrisonUpkeep || 0);
    expect(entryDelta(e2, "Nuclear Maintenance")).toBe(-bd.expenses.nuclearMaintenance || 0);
    expect(entryDelta(e2, "Contract Fees")).toBe(-bd.expenses.contractFees || 0);
    expect(entryDelta(e2, "Installation Upkeep")).toBe(-bd.expenses.installationUpkeep || 0);

    // Fixture sanity: fresh cities run no billable policies, so the policy
    // component is zero on both sides.
    expect(bd.expenses.policyCost).toBe(0);

    // netIncome is exactly the sum of the recurring components above — i.e.
    // the number the Economy tab prints is the recurring part of the tick.
    const recurringLabels = [
      "Tax Revenue", "Commercial Licensing", "Bureaucratic Overhead", "Trade Income", "Port Congestion",
      "Tourism Income", "Enterprise Tax", "Reclamation Tax", "Black Market Ore", "Zone Tribute",
      "Unit Upkeep", "Infrastructure Upkeep", "Company Contracts",
      "Garrison Upkeep", "Nuclear Maintenance", "Contract Fees",
      "Installation Upkeep",
    ];
    const recurringSum = recurringLabels.reduce((sum, l) => sum + entryDelta(e2, l), 0);
    expect(bd.netIncome).toBe(recurringSum);
  });
});

describe("economy breakdown — friction math pins", () => {
  it("no overhead or congestion at or below 200k population", () => {
    expect(computeTaxAfterOverhead(10_000, 200_000)).toEqual({ net: 10_000, overhead: 0, factor: 0 });
    expect(computeTradeAfterCongestion(8_000, 150_000)).toEqual({ net: 8_000, loss: 0, factor: 0 });
  });

  it("overhead caps at 30% and congestion at 25%", () => {
    const tax = computeTaxAfterOverhead(10_000, 10_000_000);
    expect(tax.factor).toBe(0.3);
    expect(tax.overhead).toBe(3_000);
    expect(tax.net).toBe(7_000);

    const trade = computeTradeAfterCongestion(10_000, 10_000_000);
    expect(trade.factor).toBe(0.25);
    expect(trade.loss).toBe(2_500);
    expect(trade.net).toBe(7_500);
  });

  it("negative rate inputs clamp to zero income", () => {
    expect(computeTaxAfterOverhead(-500, 1_000_000).net).toBe(0);
    expect(computeTradeAfterCongestion(-500, 1_000_000).net).toBe(0);
  });
});

describe("unit upkeep — def coverage", () => {
  it("every unit def has a finite, non-negative upkeepPerUnit", () => {
    for (const def of UNIT_CATEGORIES) {
      expect(Number.isFinite(def.upkeepPerUnit), `${def.key} upkeepPerUnit`).toBe(true);
      expect(def.upkeepPerUnit).toBeGreaterThanOrEqual(0);
    }
  });

  it("charges each unit type exactly what its recruitment card advertises", () => {
    for (const def of UNIT_CATEGORIES) {
      expect(
        computeUnitUpkeepBase({ [def.key]: 1 }),
        `${def.key} base upkeep`,
      ).toBe(def.upkeepPerUnit);
    }
  });

  it("applies the difficulty multiplier with a single floor, like the tick", () => {
    const units = { patrolJudges: 7 }; // 7 × upkeep — odd product exercises the floor
    const base = computeUnitUpkeepBase(units);
    for (const diff of ["easy", "medium", "hard"] as const) {
      expect(computeUnitUpkeep(units, diff)).toBe(Math.floor(base * getUpkeepMult(diff)));
    }
  });
});

describe("unit upkeep — save impact of the def-table switchover", () => {
  // The engine previously charged this hand-copied 39-key list (verbatim from
  // the pre-#473 tick). All other unit types were silently free. Quantify the
  // change for an established save so the balance impact is a measured number,
  // not a guess.
  const LEGACY_UNIT_UPKEEP: Record<string, number> = {
    patrolJudges: 4, rookieJudgeCadets: 2, streetPatrolUnits: 3,
    detectiveUnits: 6, antiGangTaskForces: 7, seniorJudges: 15,
    eliteJudgeStrikeTeams: 20, rapidResponseUnits: 12, riotPoliceSquads: 5,
    riotShieldUnits: 4, heavyRiotMechUnits: 18, cityDefenseInfantry: 3,
    armoredResponseUnits: 10, heavyWeaponsSquads: 12, surveillanceDrones: 1,
    tacticalCombatDrones: 3, judgeGunships: 20, forensicProfilers: 25,
    blackOpsUnits: 30, sanitationDroid: 3, wasteProcessorDroid: 4,
    streetSweeperDroid: 2, utilityRepairDroid: 5, trafficControlDroid: 3,
    medicalAssistDroid: 6, fireSuppressionDroid: 5, surveyScannerDroid: 4,
    commsRelayDroid: 3, cargoHandlerDroid: 3, heavyLifterDroid: 8,
    weldingFabricatorDroid: 7, excavatorDroid: 8, structuralScannerDroid: 4,
    pipeLayerDroid: 6, combatAssaultDroid: 15, perimeterSentryDroid: 8,
    reconScoutDroid: 6, eoDisposalDroid: 10, shieldBearerDroid: 12,
  };

  function legacyUnitUpkeep(units: Record<string, number>, difficulty: string | undefined): number {
    let total = 0;
    for (const key in LEGACY_UNIT_UPKEEP) {
      const count = units[key];
      if (typeof count !== "number" || count <= 0) continue;
      total += count * LEGACY_UNIT_UPKEEP[key];
    }
    return Math.floor(total * getUpkeepMult(difficulty));
  }

  it("def table matches the legacy rates except the one known re-rate", () => {
    // The recruitment cards were always the def table, so where the legacy
    // tick list disagreed with a card, players were being charged a number
    // the UI never showed. Pin the full diff: exactly one type was re-rated
    // (tacticalCombatDrones card says 5, the old tick charged 3) — every
    // other legacy type keeps its exact rate, and any future def change
    // must update this pin consciously.
    const mismatches: Record<string, { legacy: number; current: number }> = {};
    for (const key in LEGACY_UNIT_UPKEEP) {
      const current = computeUnitUpkeepBase({ [key]: 1 });
      if (current !== LEGACY_UNIT_UPKEEP[key]) {
        mismatches[key] = { legacy: LEGACY_UNIT_UPKEEP[key], current };
      }
    }
    expect(mismatches).toEqual({
      tacticalCombatDrones: { legacy: 3, current: 5 },
    });
  });

  it("quantifies the per-tick change on an established save", () => {
    const s = createOneMonthState();
    const legacy = legacyUnitUpkeep(s.units, s.difficulty);
    const current = computeUnitUpkeep(s.units, s.difficulty);
    const bd = computeEconomyBreakdown(s);

    // Report the magnitude in the test output so the number is on record.
    console.log(
      `[Task #473] one-month save unit upkeep: legacy=${legacy} cr/tick, ` +
      `def-table=${current} cr/tick, newly charged=${current - legacy} cr/tick, ` +
      `net income after change=${bd.netIncome} cr/tick`,
    );

    // The def table is a superset of the legacy list and its single re-rate
    // (tacticalCombatDrones 3 -> 5) goes up, so the charge can only stay
    // equal or rise for any save.
    expect(current).toBeGreaterThanOrEqual(legacy);
    expect(Number.isFinite(bd.netIncome)).toBe(true);
  });
});
