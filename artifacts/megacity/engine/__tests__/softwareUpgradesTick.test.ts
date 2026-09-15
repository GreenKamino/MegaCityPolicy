// Regression: installed software upgrades (ADMINISTRATION -> SYSTEMS) must
// actually affect the tick.
//
// Bug (Steam player report): purchasing/installing upgrades worked and the UI
// showed their effects, but engine/softwareUpgrades.ts getTotalEffects() was
// never consumed by runTick — every upgrade was a complete gameplay no-op.
//
// Fix: formulas.ts now folds getTotalEffects() into the tick — flat taxIncome,
// percent-scaled tradeEfficiency / powerEfficiency / waterEfficiency, city-stat
// keys through the TECH_STAT_DIVISOR path, publicHealth into healthDelta, and
// researchSpeed into the research percent bonus.
//
// Test technique: single-tick parity. Two identical cloned states — one with
// upgrades installed, one without — are ticked once each and their derived
// rates compared. Rates are recomputed from pre-tick state before any random
// rerolls land, so a single tick from the same starting state is deterministic
// for this comparison.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import type { GameState } from "@/engine/types";
import type { SoftwareUpgradeTier } from "@/engine/softwareUpgrades";
import { mockNoSpawnRandom } from "@/engine/__tests__/testFixtures";

function settle(state: GameState, ticks = 1): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = runTick(s).newState;
  return s;
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function withInstalled(s: GameState, installed: Record<string, SoftwareUpgradeTier>): GameState {
  const c = clone(s);
  c.softwareUpgrades = {
    installed,
    totalInstalled: Object.keys(installed).length,
    totalSpent: 0,
  };
  return c;
}

describe("software upgrades affect the tick", () => {
  beforeEach(() => {
    // The multi-tick persistence fixture below uses real runTick passes.
    // Keep random events/incidents out of this rate-parity suite so an
    // unrelated spawn cannot change an exact derived-rate assertion.
    mockNoSpawnRandom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Waste Processing Firmware tier 2 adds exactly +200 tax income to the rate", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { grid_waste_processor: 2 })).newState;
    expect(upgraded.rates.taxIncome).toBe(plain.rates.taxIncome + 200);
  });

  it("Administrative AI Suite tier 3 adds exactly +1000 tax income to the rate", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { civic_admin_suite: 3 })).newState;
    expect(upgraded.rates.taxIncome).toBe(plain.rates.taxIncome + 1000);
  });

  it("Supply Chain Intelligence tier 1 boosts trade income by 3% and tax by +200", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { log_supply_chain: 1 })).newState;
    expect(plain.rates.tradeIncome).toBeGreaterThan(0);
    expect(upgraded.rates.tradeIncome).toBe(Math.floor(plain.rates.tradeIncome * 1.03));
    expect(upgraded.rates.taxIncome).toBe(plain.rates.taxIncome + 200);
  });

  it("Power Grid Optimizer tier 3 cuts power drain", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { grid_power_optimizer: 3 })).newState;
    expect(plain.rates.powerDrain).toBeGreaterThan(0);
    // 20% cut applies before season/weather modifiers, so assert a real
    // reduction rather than an exact composed value.
    expect(upgraded.rates.powerDrain).toBeLessThan(plain.rates.powerDrain);
  });

  it("Water Distribution AI tier 2 cuts water consumption", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { grid_water_management: 2 })).newState;
    expect(plain.rates.waterConsumption).toBeGreaterThan(0);
    expect(upgraded.rates.waterConsumption).toBeLessThan(plain.rates.waterConsumption);
  });

  it("Predictive Policing Engine tier 2 pulls crime down and law & order up", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { sec_predictive_policing: 2 })).newState;
    expect(upgraded.cityStats.crime).toBeLessThan(plain.cityStats.crime);
    expect(upgraded.cityStats.lawOrder).toBeGreaterThan(plain.cityStats.lawOrder);
  });

  it("Diagnostic AI Network tier 3 lifts public health each tick", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { med_diagnostic_ai: 3 })).newState;
    expect(upgraded.cityStats.publicHealth).toBeGreaterThan(plain.cityStats.publicHealth);
  });

  it("Data Backbone Protocol tier 2 speeds up research", () => {
    const seeded = createInitialState();
    // Guarantee a non-zero base research gain so the percent bonus is visible.
    (seeded.buildings as Record<string, number>).advancedResearchLabs =
      ((seeded.buildings as Record<string, number>).advancedResearchLabs ?? 0) + 10;
    const base = settle(seeded);
    const plain = runTick(clone(base)).newState;
    const upgraded = runTick(withInstalled(base, { comms_data_backbone: 2 })).newState;
    expect(upgraded.cityStats.researchProgress).toBeGreaterThan(plain.cityStats.researchProgress);
  });

  it("stacked upgrades combine: tax income from two sources lands in full", () => {
    const base = settle(createInitialState());
    const plain = runTick(clone(base)).newState;
    // grid_waste_processor t3 = +500 tax, env_pollution_monitor t2 = +200 tax.
    const upgraded = runTick(
      withInstalled(base, { grid_waste_processor: 3, env_pollution_monitor: 2 }),
    ).newState;
    expect(upgraded.rates.taxIncome).toBe(plain.rates.taxIncome + 700);
  });

  it("effects persist across many ticks (not a one-tick blip)", () => {
    const base = settle(createInitialState());
    const plain = settle(clone(base), 6);
    const upgraded = settle(withInstalled(base, { grid_waste_processor: 2 }), 6);
    expect(upgraded.rates.taxIncome).toBe(plain.rates.taxIncome + 200);
  });

  it("a state without the softwareUpgrades field ticks without crashing", () => {
    const base = settle(createInitialState());
    const legacy = clone(base) as GameState & { softwareUpgrades?: unknown };
    delete legacy.softwareUpgrades;
    const out = runTick(legacy as GameState).newState;
    expect(out.rates.taxIncome).toBeGreaterThan(0);
  });
});
