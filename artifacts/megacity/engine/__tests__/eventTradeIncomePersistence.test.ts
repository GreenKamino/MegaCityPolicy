// Regression: trade income granted by EVENTS must persist in the per-tick
// budget instead of vanishing after a single tick.
//
// Bug: applyEventEffects / applyResponseEffects wrote the event's `tradeIncome`
// straight into `s.rates.tradeIncome`. But `rates.tradeIncome` is a DERIVED
// rate that formulas.ts recomputes from scratch every tick (base + buildings +
// tech + companies + policies + megaprojects), so the event bonus survived
// exactly one tick and then disappeared — it never truly counted in the budget.
//
// Fix: events accumulate the change into the persistent GameState.eventTradeIncome
// field, which formulas.ts re-adds into rates.tradeIncome every tick (as a flat,
// face-value bonus alongside the tech/company/policy contributions).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { applyResponseEffects, applyEventEffects } from "@/engine/events";
import { computeEconomyBreakdown } from "@/engine/economyBreakdown";
import type { GameEvent, GameState } from "@/engine/types";
import { mockNoSpawnRandom } from "@/engine/__tests__/testFixtures";

function settle(state: GameState, ticks = 1): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = runTick(s).newState;
  return s;
}

describe("event trade income persistence", () => {
  beforeEach(() => {
    // runTick exercises multiple random event/incident spawners. Keep this
    // persistence suite focused on the exact trade-rate assertions instead of
    // allowing an unrelated event to change the derived rate mid-test.
    mockNoSpawnRandom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a positive event trade bonus in the budget across many ticks", () => {
    // Baseline trade rate after the engine has computed a clean tick.
    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    // Resolve an event granting +300 trade income.
    const afterResponse = applyResponseEffects(base, {
      id: "test_trade_up",
      label: "Expand trade routes",
      description: "test",
      effects: { tradeIncome: 300 },
    });

    // The accumulator holds the change and the live rate reflects it immediately.
    expect(afterResponse.eventTradeIncome).toBe(300);
    expect(afterResponse.rates.tradeIncome).toBe(baseTrade + 300);

    // After a full tick (which recomputes rates from scratch) the bonus is STILL
    // there — this is the exact point the old code lost it.
    const t1 = settle(afterResponse);
    expect(t1.rates.tradeIncome).toBe(baseTrade + 300);

    // And it keeps persisting many ticks later.
    const t10 = settle(t1, 9);
    expect(t10.eventTradeIncome).toBe(300);
    expect(t10.rates.tradeIncome).toBe(baseTrade + 300);

    // The shared budget breakdown reflects the higher gross trade income.
    const baseBreakdown = computeEconomyBreakdown(base);
    const afterBreakdown = computeEconomyBreakdown(t10);
    expect(afterBreakdown.income.tradeGross).toBe(baseBreakdown.income.tradeGross + 300);
    expect(afterBreakdown.income.trade).toBeGreaterThan(baseBreakdown.income.trade);
  });

  it("stacks multiple event trade grants (small +1/+2 amounts included in full)", () => {
    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    // Lauren's report: +1 works but larger amounts were partially/never applied.
    let s = applyResponseEffects(base, {
      id: "t1", label: "a", description: "", effects: { tradeIncome: 1 },
    });
    s = applyResponseEffects(s, {
      id: "t2", label: "b", description: "", effects: { tradeIncome: 2 },
    });
    s = applyResponseEffects(s, {
      id: "t3", label: "c", description: "", effects: { tradeIncome: 100 },
    });

    const settled = settle(s, 5);
    expect(settled.eventTradeIncome).toBe(103);
    expect(settled.rates.tradeIncome).toBe(baseTrade + 103);
  });

  it("persists a negative event trade change and floors effective trade at zero", () => {
    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    // A modest embargo: -200 persists as a permanent drag.
    const embargo = settle(
      applyResponseEffects(base, {
        id: "embargo", label: "Embargo", description: "", effects: { tradeIncome: -200 },
      }),
      5,
    );
    expect(embargo.eventTradeIncome).toBe(-200);
    expect(embargo.rates.tradeIncome).toBe(baseTrade - 200);

    // A crushing embargo drives the rate negative, but the credited/displayed
    // trade income never goes below zero (it does not become a charge).
    const crushing = settle(
      applyResponseEffects(base, {
        id: "crush", label: "Total blockade", description: "", effects: { tradeIncome: -100000 },
      }),
      5,
    );
    expect(crushing.rates.tradeIncome).toBeLessThan(0);
    const breakdown = computeEconomyBreakdown(crushing);
    expect(breakdown.income.trade).toBe(0);
    expect(breakdown.income.tradeGross).toBe(0);
  });

  it("auto-fired events (applyEventEffects) also persist their trade change", () => {
    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    const event: GameEvent = {
      id: "auto_trade",
      title: "New freight corridor",
      description: "test",
      severity: "low",
      effects: { tradeIncome: 150 },
      timestamp: Date.now(),
      resolved: false,
    };

    const settled = settle(applyEventEffects(base, event), 5);
    expect(settled.eventTradeIncome).toBe(150);
    expect(settled.rates.tradeIncome).toBe(baseTrade + 150);
  });
});
