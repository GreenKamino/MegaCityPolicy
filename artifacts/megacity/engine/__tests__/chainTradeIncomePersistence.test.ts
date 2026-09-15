// Regression: trade income granted by EVENT CHAIN responses must land and
// persist, exactly like event/response trade income already does.
//
// Bug (Steam player report): applyChainEffects in eventChains.ts only handled
// loyalty_<id>, population, resource keys and cityStats keys. `tradeIncome`
// (space elevator chain: +200 supply stage, +500 opening stage) and
// `researchSpeed` were silently dropped — documented dead keys.
//
// Fix: applyChainEffects now mirrors events.ts — tradeIncome accumulates into
// the persistent GameState.eventTradeIncome field (re-added into
// rates.tradeIncome every tick by formulas.ts) plus an immediate live-rate
// bump; researchSpeed grants researchProgress clamped to [0, researchTarget].

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { applyChainEffects, EVENT_CHAINS } from "@/engine/eventChains";
import type { GameState } from "@/engine/types";
import { mockNoSpawnRandom } from "@/engine/__tests__/testFixtures";

function settle(state: GameState, ticks = 1): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = runTick(s).newState;
  return s;
}

function findChainResponse(responseId: string): { effects?: Record<string, number> } {
  for (const chain of EVENT_CHAINS) {
    for (const stage of chain.stages) {
      for (const resp of stage.responses) {
        if (resp.id === responseId) return resp as { effects?: Record<string, number> };
      }
    }
  }
  throw new Error(`Chain response not found: ${responseId}`);
}

describe("event chain tradeIncome / researchSpeed effects", () => {
  beforeEach(() => {
    // settle() runs real multi-tick engine passes. Pin the random spawners so
    // unrelated events cannot change the derived trade rate under test.
    mockNoSpawnRandom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a chain response tradeIncome grant persists in the budget across ticks", () => {
    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    applyChainEffects(base, { tradeIncome: 200 });
    expect(base.eventTradeIncome).toBe(200);
    expect(base.rates.tradeIncome).toBe(baseTrade + 200);

    // Survives the full-tick rate recompute, and keeps surviving.
    const t5 = settle(base, 5);
    expect(t5.eventTradeIncome).toBe(200);
    expect(t5.rates.tradeIncome).toBe(baseTrade + 200);
  });

  it("the real space elevator chain pays out +200 then +500 trade income", () => {
    // Anchor to the shipped content: these are the exact responses the Steam
    // player exercised.
    const feed = findChainResponse("cor_feed");
    const open = findChainResponse("cor_open_elevator");
    expect(feed.effects?.tradeIncome).toBe(200);
    expect(open.effects?.tradeIncome).toBe(500);

    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    applyChainEffects(base, feed.effects ?? {});
    applyChainEffects(base, open.effects ?? {});
    expect(base.eventTradeIncome).toBe(700);

    const settled = settle(base, 5);
    expect(settled.eventTradeIncome).toBe(700);
    expect(settled.rates.tradeIncome).toBe(baseTrade + 700);
  });

  it("negative chain tradeIncome persists as a drag", () => {
    const base = settle(createInitialState());
    const baseTrade = base.rates.tradeIncome;

    applyChainEffects(base, { tradeIncome: -200 });
    const settled = settle(base, 3);
    expect(settled.eventTradeIncome).toBe(-200);
    expect(settled.rates.tradeIncome).toBe(baseTrade - 200);
  });

  it("chain researchSpeed grants research progress, clamped to [0, target]", () => {
    const s = createInitialState();
    s.cityStats.researchProgress = 10;
    s.cityStats.researchTarget = 100;

    applyChainEffects(s, { researchSpeed: 5 });
    expect(s.cityStats.researchProgress).toBe(15);

    // Clamps at the target...
    applyChainEffects(s, { researchSpeed: 10_000 });
    expect(s.cityStats.researchProgress).toBe(100);

    // ...and floors at zero.
    applyChainEffects(s, { researchSpeed: -10_000 });
    expect(s.cityStats.researchProgress).toBe(0);
  });
});
